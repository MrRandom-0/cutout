// The inference worker. Segmentation runs off the main thread so the page
// stays responsive during the seconds a CPU inference takes.
//
// Protocol (see engine.ts for the client side):
//   in:  { type: "init", ortBase }          — download model, create session
//        { type: "process", id, bitmap }    — run one image, reply with a mask
//   out: { type: "model-progress", loaded, total }
//        { type: "ready", provider }        — provider: "webgpu" | "wasm"
//        { type: "init-error", message }
//        { type: "result", id, mask, size, runMs }
//        { type: "process-error", id, message }

import type * as OrtNamespace from "onnxruntime-web";
import { maskFromModelOutput, rgbaToModelInput } from "./mask";
import { fetchModelBytes, MODEL } from "./model";

type Provider = "webgpu" | "wasm";
type Ort = typeof OrtNamespace;

interface InitMessage {
  type: "init";
  /** Base URL of the directory holding the runtime's WASM files ("/ort/"). */
  ortBase: string;
}
interface ProcessMessage {
  type: "process";
  id: number;
  bitmap: ImageBitmap;
}
type Incoming = InitMessage | ProcessMessage;

let ort: Ort | null = null;
let session: OrtNamespace.InferenceSession | null = null;
let initStarted = false;

// A single reused canvas for preprocessing — created lazily because
// OffscreenCanvas sizing is fixed at the model's input size.
let scratch: OffscreenCanvas | null = null;
let scratchCtx: OffscreenCanvasRenderingContext2D | null = null;

self.onmessage = (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.type === "init") {
    if (!initStarted) {
      initStarted = true;
      void init(message.ortBase);
    }
  } else if (message.type === "process") {
    void process(message);
  }
};

/**
 * Point the runtime at the same-origin WASM binaries in /ort/.
 * onnxruntime-web 1.31 takes wasmPaths as { wasm, mjs } — one pair per
 * runtime build: the JSEP build (default entry, used for WebGPU) and the
 * plain threaded build (/wasm entry). The files are copied into public/ort/
 * from the npm package at build time (scripts/copy-ort-assets.mjs); without
 * this override the bundled runtime falls back to URLs that only exist
 * inside the bundler's output.
 */
function configureRuntime(runtime: Ort, provider: Provider, ortBase: string): void {
  const stem =
    provider === "webgpu" ? "ort-wasm-simd-threaded.jsep" : "ort-wasm-simd-threaded";
  runtime.env.wasm.wasmPaths = {
    wasm: `${ortBase}${stem}.wasm`,
    mjs: `${ortBase}${stem}.mjs`,
  };
  // The threaded WASM build needs cross-origin isolation; without it the
  // runtime silently falls back to one thread, so cap the request at 1 to
  // keep the thread pool honest.
  runtime.env.wasm.numThreads = self.crossOriginIsolated
    ? Math.min(4, navigator.hardwareConcurrency || 1)
    : 1;
}

async function init(ortBase: string): Promise<void> {
  try {
    const wanted = await pickProvider();
    // Two runtime builds, one per provider: the default entry (JSEP build)
    // for WebGPU, the /wasm entry (plain threaded build, half the download)
    // for the WASM fallback. Only the chosen one is fetched.
    ort =
      wanted === "webgpu"
        ? await import("onnxruntime-web")
        : await import("onnxruntime-web/wasm");
    configureRuntime(ort, wanted, ortBase);

    const bytes = await fetchModelBytes((loaded, total) => {
      post({ type: "model-progress", loaded, total });
    });

    try {
      session = await createSession(bytes, wanted);
      post({ type: "ready", provider: wanted });
    } catch (error) {
      if (wanted === "wasm") throw error;
      // A WebGPU session that fails to build is not fatal: load the WASM
      // build and retry with the same model bytes rather than failing.
      ort = await import("onnxruntime-web/wasm");
      configureRuntime(ort, "wasm", ortBase);
      session = await createSession(bytes, "wasm");
      post({ type: "ready", provider: "wasm" });
    }
  } catch (error) {
    post({ type: "init-error", message: errorMessage(error) });
  }
}

function createSession(
  bytes: ArrayBuffer,
  provider: Provider,
): Promise<OrtNamespace.InferenceSession> {
  if (!ort) throw new Error("ONNX Runtime is not loaded.");
  return ort.InferenceSession.create(bytes, {
    executionProviders: [provider],
    // The exact options this model was verified with during development:
    // heavier graph optimisation and arena pre-allocation are left off —
    // they raise peak memory without improving this convolutional graph.
    graphOptimizationLevel: "basic",
    enableMemPattern: false,
    enableCpuMemArena: false,
  });
}

/**
 * WebGPU only counts if an adapter actually exists — `navigator.gpu` can be
 * present with no usable adapter (headless browsers, blocked drivers), and
 * asking ONNX Runtime for WebGPU then just errors.
 */
async function pickProvider(): Promise<Provider> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu) {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) return "webgpu";
    } catch {
      // Fall through to WASM.
    }
  }
  return "wasm";
}

async function process(message: ProcessMessage): Promise<void> {
  const { id, bitmap } = message;
  try {
    if (!session || !ort) throw new Error("The model is not loaded yet.");
    const size = MODEL.inputSize;
    if (!scratch || !scratchCtx) {
      scratch = new OffscreenCanvas(size, size);
      scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
      if (!scratchCtx) throw new Error("Canvas is not available in this browser.");
    }
    scratchCtx.drawImage(bitmap, 0, 0, size, size);
    bitmap.close();
    const pixels = scratchCtx.getImageData(0, 0, size, size);
    const input = rgbaToModelInput(pixels.data, size, size, MODEL.normalization);
    const tensor = new ort.Tensor("float32", input, [1, 3, size, size]);

    const started = performance.now();
    const outputs = await session.run({ [session.inputNames[0]]: tensor });
    const runMs = Math.round(performance.now() - started);

    const raw = outputs[session.outputNames[0]].data as Float32Array;
    const mask = maskFromModelOutput(raw);
    post({ type: "result", id, mask, size, runMs }, [mask.buffer]);
  } catch (error) {
    post({ type: "process-error", id, message: errorMessage(error) });
  }
}

function post(message: Record<string, unknown>, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
