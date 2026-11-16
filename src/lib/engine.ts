// Main-thread client for the inference worker (engine.worker.ts).
//
// Owns the worker lifecycle: lazy spawn on first use, model-download
// progress fan-out, request/response matching for process calls, and a
// single retry path — if the worker dies or the model fails to load, the
// next ensureReady() starts from a clean worker.

// onnxruntime-web loads its WASM binaries and JS glue from /ort/ (copied
// there from the npm package by scripts/copy-ort-assets.mjs — the package's
// exports map does not expose the files for direct import). The worker is
// given the base URL and points the runtime at the exact pair of files for
// whichever of its two builds it loads (see engine.worker.ts).
const ORT_BASE = `${import.meta.env.BASE_URL}ort/`;

export type EngineProvider = "webgpu" | "wasm";
export type EngineStatus = "idle" | "loading" | "ready" | "error";

export interface MaskResult {
  /** Row-major 0..1 alpha mask at the model's input size (square). */
  mask: Float32Array;
  size: number;
  /** Inference time inside the worker, milliseconds. */
  runMs: number;
}

type ProgressListener = (loaded: number, total: number) => void;

interface PendingRequest {
  resolve: (result: MaskResult) => void;
  reject: (error: Error) => void;
}

class Engine {
  status: EngineStatus = "idle";
  provider: EngineProvider | null = null;
  error: string | null = null;

  private worker: Worker | null = null;
  private readyPromise: Promise<EngineProvider> | null = null;
  private readyResolve: ((provider: EngineProvider) => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private progressListeners = new Set<ProgressListener>();

  /** Subscribe to model-download progress. Returns an unsubscribe function. */
  onModelProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  /**
   * Load the model and build the inference session. Safe to call repeatedly:
   * concurrent callers share one load, and a failed load can be retried by
   * calling again (a fresh worker is spawned).
   */
  ensureReady(): Promise<EngineProvider> {
    if (this.status === "ready" && this.provider) return Promise.resolve(this.provider);
    if (this.readyPromise) return this.readyPromise;

    this.status = "loading";
    this.error = null;
    this.spawnWorker();
    this.readyPromise = new Promise<EngineProvider>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    this.worker!.postMessage({ type: "init", ortBase: ORT_BASE });
    return this.readyPromise;
  }

  /** Run segmentation on one image. The bitmap is transferred (and closed by the worker). */
  async process(bitmap: ImageBitmap): Promise<MaskResult> {
    await this.ensureReady();
    const id = this.nextId++;
    return new Promise<MaskResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker!.postMessage({ type: "process", id, bitmap }, [bitmap]);
    });
  }

  private spawnWorker(): void {
    this.worker?.terminate();
    this.worker = new Worker(new URL("./engine.worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<Record<string, unknown>>) =>
      this.handleMessage(event.data);
    this.worker.onerror = () => {
      this.failAll(new Error("The background-removal worker stopped unexpectedly."));
    };
  }

  private handleMessage(message: Record<string, unknown>): void {
    switch (message.type) {
      case "model-progress": {
        const loaded = message.loaded as number;
        const total = message.total as number;
        this.progressListeners.forEach((listener) => listener(loaded, total));
        break;
      }
      case "ready": {
        this.status = "ready";
        this.provider = message.provider as EngineProvider;
        this.readyResolve?.(this.provider);
        break;
      }
      case "init-error": {
        const error = new Error(message.message as string);
        this.status = "error";
        this.error = error.message;
        this.readyPromise = null;
        this.readyReject?.(error);
        break;
      }
      case "result": {
        const pending = this.pending.get(message.id as number);
        if (pending) {
          this.pending.delete(message.id as number);
          pending.resolve({
            mask: message.mask as Float32Array,
            size: message.size as number,
            runMs: message.runMs as number,
          });
        }
        break;
      }
      case "process-error": {
        const pending = this.pending.get(message.id as number);
        if (pending) {
          this.pending.delete(message.id as number);
          pending.reject(new Error(message.message as string));
        }
        break;
      }
    }
  }

  private failAll(error: Error): void {
    this.status = "error";
    this.error = error.message;
    this.readyPromise = null;
    this.readyReject?.(error);
    this.pending.forEach((pending) => pending.reject(error));
    this.pending.clear();
  }
}

/** The shared engine instance — one worker, one model, whole app. */
export const engine = new Engine();
