import {
  CheckCircle2,
  Cpu,
  Download,
  FileArchive,
  Loader2,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import BackgroundPicker from "./components/BackgroundPicker";
import CompareSlider from "./components/CompareSlider";
import Dropzone from "./components/Dropzone";
import {
  cardClass,
  ErrorBox,
  labelClass,
  primaryButtonClass,
  ProgressBar,
  secondaryButtonClass,
} from "./components/ui";
import type { BackgroundChoice } from "./lib/colours";
import { downloadBlob } from "./lib/download";
import { engine, type EngineProvider } from "./lib/engine";
import { formatBytes, formatDimensions } from "./lib/format";
import { maskCoverage } from "./lib/mask";
import { MODEL } from "./lib/model";
import { fitWithinLongestEdge, presetById, SIZE_PRESETS } from "./lib/presets";
import {
  compositeCutout,
  decodeImageFile,
  outputName,
  renderExport,
  type ExportFormat,
} from "./lib/processImage";
import { nextQueued, requeue, summarize, updateItem, type BatchItem } from "./lib/queue";
import { buildZip } from "./lib/zip";

interface ItemState extends BatchItem {
  file: File;
  thumbUrl: string;
  width: number | null;
  height: number | null;
  cutout: HTMLCanvasElement | null;
  subjectFraction: number | null;
  runMs: number | null;
}

type ModelPhase = "idle" | "loading" | "ready" | "error";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
        <Hero />
        <Tool />
        <WhyCutout />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/85">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white shadow-pop">
            <Scissors className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="text-[17px] font-bold tracking-tight">
            Cut<span className="text-teal-700 dark:text-teal-300">out</span>
          </span>
        </span>
        <p className="ml-auto hidden items-center gap-1.5 rounded-full border border-teal-700/20 bg-teal-50 px-3 py-1 text-[13px] font-medium text-teal-800 md:inline-flex dark:border-teal-400/20 dark:bg-teal-950 dark:text-teal-200">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Your photos never leave this device
        </p>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <div className="dot-grid mb-10 rounded-3xl px-2 py-6 sm:px-6">
      <p className="mb-2 text-[13px] font-semibold tracking-widest text-teal-700 uppercase dark:text-teal-300">
        Free · Open source · No uploads
      </p>
      <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
        Remove the background. Keep every pixel.
      </h1>
      <p className="mt-4 max-w-2xl leading-relaxed text-zinc-600 dark:text-zinc-400">
        Cutout removes photo backgrounds right here in your browser — full resolution, no watermark,
        no credits, no account. Built for the sellers and creators whose background remover shuts
        down on 1 December 2026.
      </p>
    </div>
  );
}

function Tool() {
  const [items, setItems] = useState<ItemState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [background, setBackground] = useState<BackgroundChoice>({ kind: "transparent" });
  const [presetId, setPresetId] = useState("original");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [exportError, setExportError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);

  const [modelPhase, setModelPhase] = useState<ModelPhase>("idle");
  const [modelProgress, setModelProgress] = useState<{ loaded: number; total: number } | null>(
    null,
  );
  const [provider, setProvider] = useState<EngineProvider | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  const inFlight = useRef<Set<string>>(new Set());
  const [processTick, setProcessTick] = useState(0);

  useEffect(
    () => engine.onModelProgress((loaded, total) => setModelProgress({ loaded, total })),
    [],
  );

  const startModel = useCallback(() => {
    setModelPhase("loading");
    setModelError(null);
    engine
      .ensureReady()
      .then((readyProvider) => {
        setProvider(readyProvider);
        setModelPhase("ready");
      })
      .catch((error: Error) => {
        setModelPhase("error");
        setModelError(error.message);
      });
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const fresh: ItemState[] = files.map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        status: "queued",
        error: null,
        file,
        thumbUrl: URL.createObjectURL(file),
        width: null,
        height: null,
        cutout: null,
        subjectFraction: null,
        runMs: null,
      }));
      setItems((current) => [...current, ...fresh]);
      if (modelPhase === "idle") startModel();
    },
    [modelPhase, startModel],
  );

  // Sequential processing loop: one image at a time (the model session is a
  // single shared resource), a failure marks just that item and moves on.
  useEffect(() => {
    if (modelPhase !== "ready") return;
    const next = nextQueued(items);
    if (!next || inFlight.current.has(next.id)) return;
    inFlight.current.add(next.id);
    setItems((current) => updateItem(current, next.id, { status: "processing" }));
    void (async () => {
      try {
        const decoded = await decodeImageFile(next.file);
        setItems((current) =>
          updateItem(current, next.id, { width: decoded.width, height: decoded.height }),
        );
        const copy = await createImageBitmap(decoded.bitmap);
        const result = await engine.process(copy);
        const cutout = compositeCutout(decoded.bitmap, result.mask, result.size);
        decoded.bitmap.close();
        const coverage = maskCoverage(result.mask);
        setItems((current) =>
          updateItem(current, next.id, {
            status: "done",
            cutout,
            subjectFraction: coverage.subjectFraction,
            runMs: result.runMs,
          }),
        );
        setSelectedId((current) => current ?? next.id);
      } catch (error) {
        setItems((current) =>
          updateItem(current, next.id, {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        inFlight.current.delete(next.id);
        setProcessTick((tick) => tick + 1);
      }
    })();
  }, [items, modelPhase, processTick]);

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id);
      if (item) URL.revokeObjectURL(item.thumbUrl);
      return current.filter((candidate) => candidate.id !== id);
    });
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  const clearAll = useCallback(() => {
    items.forEach((item) => URL.revokeObjectURL(item.thumbUrl));
    setItems([]);
    setSelectedId(null);
  }, [items]);

  const preset = presetById(presetId);
  const summary = summarize(items);
  const selected =
    items.find((item) => item.id === selectedId) ??
    items.find((item) => item.status === "done") ??
    items[0] ??
    null;

  async function downloadOne(item: ItemState) {
    if (!item.cutout) return;
    setExportError(null);
    try {
      const blob = await renderExport(item.cutout, { background, preset, format });
      downloadBlob(blob, outputName(item.name, format));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    }
  }

  async function downloadAll() {
    setExportError(null);
    setZipping(true);
    try {
      const entries = [];
      for (const item of items) {
        if (item.status !== "done" || !item.cutout) continue;
        const blob = await renderExport(item.cutout, { background, preset, format });
        entries.push({ name: outputName(item.name, format), blob });
      }
      if (entries.length === 0) return;
      const zip = await buildZip(entries);
      downloadBlob(zip, "cutouts.zip");
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setZipping(false);
    }
  }

  return (
    <section aria-label="Background remover" className={`${cardClass} p-5 sm:p-7`}>
      {items.length === 0 ? (
        <Dropzone
          accept="image/*"
          label="Drop photos here"
          hint="Product shots, portraits, anything — one photo or a whole batch"
          onFiles={addFiles}
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className={secondaryButtonClass + " cursor-pointer"}>
              Add more photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length > 0) addFiles(files);
                  event.target.value = "";
                }}
              />
            </label>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {summary.done} of {summary.total} done
              {summary.failed > 0 ? ` · ${summary.failed} failed` : ""}
              {summary.processing > 0 ? " · working…" : ""}
            </span>
            <span className="ml-auto flex gap-2">
              {summary.done > 1 ? (
                <button
                  type="button"
                  onClick={downloadAll}
                  disabled={zipping}
                  className={primaryButtonClass}
                >
                  <FileArchive className="h-4 w-4" aria-hidden />
                  {zipping ? "Zipping…" : "Download all (.zip)"}
                </button>
              ) : null}
              <button type="button" onClick={clearAll} className={secondaryButtonClass}>
                <Trash2 className="h-4 w-4" aria-hidden />
                Clear all
              </button>
            </span>
          </div>

          <SettingsBar
            background={background}
            onBackground={setBackground}
            presetId={presetId}
            onPreset={setPresetId}
            format={format}
            onFormat={setFormat}
          />

          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                selected={selected?.id === item.id}
                onSelect={() => setSelectedId(item.id)}
                onDownload={() => downloadOne(item)}
                onRetry={() => setItems((current) => requeue(current, item.id))}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </ul>

          {selected ? <Preview item={selected} background={background} preset={preset} /> : null}
          {exportError ? <ErrorBox message={exportError} /> : null}
        </div>
      )}

      <ModelStatus
        phase={modelPhase}
        progress={modelProgress}
        provider={provider}
        error={modelError}
        onRetry={startModel}
        hasItems={items.length > 0}
      />
    </section>
  );
}

function SettingsBar({
  background,
  onBackground,
  presetId,
  onPreset,
  format,
  onFormat,
}: {
  background: BackgroundChoice;
  onBackground: (choice: BackgroundChoice) => void;
  presetId: string;
  onPreset: (id: string) => void;
  format: ExportFormat;
  onFormat: (format: ExportFormat) => void;
}) {
  return (
    <div className="grid gap-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div>
        <span className={labelClass}>Background</span>
        <BackgroundPicker value={background} onChange={onBackground} />
      </div>
      <div>
        <label htmlFor="size-preset" className={labelClass}>
          Output size
        </label>
        <select
          id="size-preset"
          value={presetId}
          onChange={(event) => onPreset(event.target.value)}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-teal-600 focus:ring-2 focus:ring-teal-600/25 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        >
          {SIZE_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label} — {preset.hint.toLowerCase()}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          Presets only shrink — a photo is never upscaled.
        </p>
      </div>
      <div>
        <span className={labelClass}>Format</span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Export format">
          {(["png", "jpeg"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={format === option}
              onClick={() => onFormat(option)}
              className={[
                "rounded-full px-3.5 py-1.5 text-sm font-medium transition",
                format === option
                  ? "bg-teal-700 text-white shadow-pop"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600",
              ].join(" ")}
            >
              {option === "png" ? "PNG" : "JPG"}
            </button>
          ))}
        </div>
        {format === "jpeg" && background.kind === "transparent" ? (
          <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            JPG has no transparency — it flattens onto white.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ItemRow({
  item,
  selected,
  onSelect,
  onDownload,
  onRetry,
  onRemove,
}: {
  item: ItemState;
  selected: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  return (
    <li
      className={`flex items-center gap-3.5 py-3 ${selected ? "" : "opacity-90"}`}
      aria-current={selected}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
      >
        <img
          src={item.thumbUrl}
          alt=""
          className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-zinc-200 dark:ring-zinc-700"
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{item.name}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">
            {item.width && item.height ? `${formatDimensions(item.width, item.height)} · ` : ""}
            {formatBytes(item.file.size)}
          </span>
          {item.status === "error" && item.error ? (
            <span className="mt-0.5 block text-xs text-red-600 dark:text-red-400">
              {item.error}
            </span>
          ) : null}
        </span>
      </button>
      <StatusChip item={item} />
      {item.status === "done" ? (
        <button
          type="button"
          onClick={onDownload}
          className={secondaryButtonClass}
          aria-label={`Download ${item.name} without background`}
        >
          <Download className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Download</span>
        </button>
      ) : null}
      {item.status === "error" ? (
        <button type="button" onClick={onRetry} className={secondaryButtonClass}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Retry
        </button>
      ) : null}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.name}`}
        className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

function StatusChip({ item }: { item: ItemState }) {
  switch (item.status) {
    case "queued":
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          Queued
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-teal-700/10 px-2.5 py-1 text-xs font-medium text-teal-800 dark:bg-teal-400/10 dark:text-teal-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Removing background…
        </span>
      );
    case "done":
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-teal-700/10 px-2.5 py-1 text-xs font-medium text-teal-800 dark:bg-teal-400/10 dark:text-teal-200">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          Done
        </span>
      );
    case "error":
      return (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-500/10 dark:text-red-200">
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
          Failed
        </span>
      );
  }
}

function Preview({
  item,
  background,
  preset,
}: {
  item: ItemState;
  background: BackgroundChoice;
  preset: ReturnType<typeof presetById>;
}) {
  if (item.status === "error") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-500/30 dark:bg-red-500/5">
        <h2 className="font-semibold text-red-900 dark:text-red-100">
          This photo could not be processed
        </h2>
        <p className="mt-1 text-sm text-red-800 dark:text-red-200">{item.error}</p>
        <p className="mt-2 text-sm text-red-800 dark:text-red-200">
          The rest of the batch is unaffected — fix or remove this one and carry on.
        </p>
      </div>
    );
  }
  if (!item.cutout) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
        <Loader2 className="h-5 w-5 animate-spin text-teal-700 dark:text-teal-300" aria-hidden />
        {item.status === "processing"
          ? "Removing the background — CPU processing can take a little while on large photos."
          : "Waiting its turn — photos are processed one at a time."}
      </div>
    );
  }
  const fitted = fitWithinLongestEdge(item.cutout.width, item.cutout.height, preset.longestEdge);
  return (
    <div>
      <CompareSlider
        originalUrl={item.thumbUrl}
        result={item.cutout}
        background={background}
        alt={`${item.name} with the background removed`}
      />
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Output: {formatDimensions(fitted.width, fitted.height)}
        {fitted.scaled ? ` (shrunk to the ${preset.label} preset)` : " (original resolution)"}
        {item.subjectFraction !== null
          ? ` · subject covers ${Math.round(item.subjectFraction * 100)}% of the frame`
          : ""}
        {item.runMs !== null ? ` · cut in ${(item.runMs / 1000).toFixed(1)}s on this device` : ""}
      </p>
    </div>
  );
}

function ModelStatus({
  phase,
  progress,
  provider,
  error,
  onRetry,
  hasItems,
}: {
  phase: ModelPhase;
  progress: { loaded: number; total: number } | null;
  provider: EngineProvider | null;
  error: string | null;
  onRetry: () => void;
  hasItems: boolean;
}) {
  if (phase === "idle") {
    return (
      <p className="mt-5 text-sm text-zinc-500 dark:text-zinc-400">
        The first photo starts a one-time download of the {MODEL.displayName} model (
        {formatBytes(MODEL.bytes)}) — after that, Cutout works fully offline. Nothing you add is
        ever uploaded.
      </p>
    );
  }
  if (phase === "loading") {
    const percent =
      progress && progress.total > 0
        ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
        : 0;
    return (
      <div className="mt-5">
        <ProgressBar
          percent={percent}
          label={
            progress
              ? `Downloading the model — ${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}`
              : "Loading the model…"
          }
        />
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          One-time download, cached on this device. Your photos are not part of it.
        </p>
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div className="mt-5 space-y-3">
        <ErrorBox message={`The model could not be loaded: ${error ?? "unknown error"}`} />
        <button type="button" onClick={onRetry} className={secondaryButtonClass}>
          <RotateCcw className="h-4 w-4" aria-hidden />
          Retry model download
        </button>
      </div>
    );
  }
  return (
    <p className="mt-5 inline-flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
      {provider === "webgpu" ? (
        <Zap className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden />
      ) : (
        <Cpu className="h-4 w-4 text-teal-700 dark:text-teal-300" aria-hidden />
      )}
      Model ready — running on your {provider === "webgpu" ? "GPU" : "CPU"}, works offline now.
      {hasItems ? "" : " Add a photo to begin."}
    </p>
  );
}

function WhyCutout() {
  return (
    <section aria-label="Why Cutout" className="mt-14">
      <h2 className="text-2xl font-extrabold tracking-tight">Why Cutout exists</h2>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <article className={cardClass + " p-5"}>
          <h3 className="font-semibold">The tool that closes</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            remove.bg's standalone website and API shut down on 1 December 2026, and its users are
            being moved toward paid subscriptions. Cutout is the open-source replacement that can't
            be shut down, paywalled or acquired — it's MIT-licensed code that runs on your own
            machine.
          </p>
        </article>
        <article className={cardClass + " p-5"}>
          <h3 className="font-semibold">Private by architecture</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            There is no upload because there is no server. Open your browser's network tab while it
            works: the only thing ever downloaded is the AI model itself. Your photos are processed
            in this tab and never leave the device.
          </p>
        </article>
        <article className={cardClass + " p-5"}>
          <h3 className="font-semibold">Full resolution, honestly</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            The model studies a 1024 × 1024 copy to decide what's subject and what's background —
            then that decision is applied to your original pixels. A 24-megapixel photo comes out at
            24 megapixels, not a 0.25-megapixel preview with a paywall behind it.
          </p>
        </article>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          {
            step: "1 · Drop photos",
            text: "One portrait or a batch of fifty product shots. JPEG, PNG, WebP — whatever your browser can open.",
          },
          {
            step: "2 · The model cuts",
            text: "ISNet segments subject from background on-device — GPU when your browser offers one, CPU otherwise.",
          },
          {
            step: "3 · Download & sell",
            text: "Transparent PNG, or flattened on white/any colour, sized for Amazon, eBay, Etsy or Shopify. Batches arrive as one zip.",
          },
        ].map((item) => (
          <article
            key={item.step}
            className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60"
          >
            <h3 className="text-sm font-semibold tracking-wide text-teal-700 uppercase dark:text-teal-300">
              {item.step}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {item.text}
            </p>
          </article>
        ))}
      </div>
      <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
        Model: {MODEL.displayName} from the DIS project (Apache-2.0), ONNX conversion published by
        IMG.LY ({MODEL.license}). Runtime: onnxruntime-web (MIT). Cutout itself is MIT-licensed and
        free forever.
      </p>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-8 sm:px-6">
        <span className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-700 text-white">
            <Scissors className="h-3.5 w-3.5" aria-hidden />
          </span>
          Cutout
        </span>
        <span className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <ShieldCheck className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
          Your photos never leave this device — there is no server to send them to.
        </span>
        <span className="ml-auto text-sm text-zinc-600 dark:text-zinc-400">
          MIT licensed ·{" "}
          <a
            href="https://github.com/MrRandom-0/cutout"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-teal-700 hover:underline dark:text-teal-300"
          >
            Source on GitHub
          </a>
        </span>
      </div>
    </footer>
  );
}
