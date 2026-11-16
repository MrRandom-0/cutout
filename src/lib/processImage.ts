// Turning a decoded photo + model mask into downloadable files.
//
// The model works on a small square copy; everything here works at the
// photo's original resolution. The full-res cut-out canvas is the single
// source every export renders from, so what you preview is what you get.

import { backgroundRgb, flattenOver, WHITE, type BackgroundChoice } from "./colours";
import { fitWithinLongestEdge, type SizePreset } from "./presets";
import { applyMaskAsAlpha, featherMask, resizeMaskBilinear } from "./mask";
import { replaceExtension } from "./format";

/**
 * Hard ceiling for decoding: 120 megapixels. Above this, canvas buffers
 * alone (several hundred MB per copy) make browsers kill the tab. The limit
 * is stated to the user, never silently downscaled around.
 */
export const MAX_PIXELS = 120_000_000;

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

/** Decode a file into a bitmap, honouring EXIF orientation where supported. */
export async function decodeImageFile(file: File): Promise<DecodedImage> {
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      bitmap = null;
    }
  }
  if (!bitmap) {
    throw new Error(
      "This file could not be read as an image. If it is an iPhone HEIC photo, " +
        "export it as JPEG first — this browser cannot decode HEIC.",
    );
  }
  if (bitmap.width * bitmap.height > MAX_PIXELS) {
    const width = bitmap.width;
    const height = bitmap.height;
    bitmap.close();
    throw new Error(
      `This photo is ${width} × ${height} — over the 120 megapixel limit this tool can ` +
        "safely process in a browser tab.",
    );
  }
  return { bitmap, width: bitmap.width, height: bitmap.height };
}

/**
 * Composite the full-resolution cut-out: original pixels, with the upscaled,
 * lightly feathered mask as their alpha channel.
 */
export function compositeCutout(
  source: ImageBitmap,
  mask: Float32Array,
  maskSize: number,
): HTMLCanvasElement {
  const { width, height } = source;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);

  const upscaled = resizeMaskBilinear(mask, maskSize, maskSize, width, height);
  // Feather proportional to size — about 2px on a typical 1600px photo.
  // The bilinear upscale already softens edges; this just takes the last
  // of the stair-stepping out.
  const radius = Math.max(1, Math.round(Math.min(width, height) / 800));
  const feathered = featherMask(upscaled, width, height, radius);
  applyMaskAsAlpha(imageData.data, feathered);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export type ExportFormat = "png" | "jpeg";

export interface ExportOptions {
  background: BackgroundChoice;
  preset: SizePreset;
  format: ExportFormat;
}

/**
 * Render one export file from a cut-out canvas: apply the size preset
 * (longest edge, never upscale), then either keep transparency (PNG) or
 * flatten over the chosen background. JPEG cannot store alpha, so a JPEG
 * export with "transparent" chosen flattens onto white — the UI says so.
 */
export async function renderExport(
  cutout: HTMLCanvasElement,
  options: ExportOptions,
): Promise<Blob> {
  const fitted = fitWithinLongestEdge(cutout.width, cutout.height, options.preset.longestEdge);
  const canvas = document.createElement("canvas");
  canvas.width = fitted.width;
  canvas.height = fitted.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  ctx.drawImage(cutout, 0, 0, fitted.width, fitted.height);

  const chosen = backgroundRgb(options.background);
  const flattenTarget = options.format === "jpeg" && chosen === null ? WHITE : chosen;
  if (flattenTarget) {
    const imageData = ctx.getImageData(0, 0, fitted.width, fitted.height);
    flattenOver(imageData.data, flattenTarget);
    ctx.putImageData(imageData, 0, 0);
  }

  const type = options.format === "jpeg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) throw new Error("The browser could not encode the exported image.");
  return blob;
}

/** "product.jpg" + png -> "product-cutout.png" — outputs never overwrite inputs. */
export function outputName(inputName: string, format: ExportFormat): string {
  const extension = format === "jpeg" ? "jpg" : "png";
  const renamed = replaceExtension(inputName, extension);
  const dot = renamed.lastIndexOf(".");
  return `${renamed.slice(0, dot)}-cutout${renamed.slice(dot)}`;
}
