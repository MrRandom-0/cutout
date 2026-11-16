// The segmentation model: what it is, where it lives, and how to fetch it.
//
// Cutout runs ISNet (general-use) — a dichotomous image segmentation model
// from the DIS project (Apache-2.0), converted to ONNX and published by
// IMG.LY under the MIT licence on the model repo itself:
//   https://huggingface.co/imgly/isnet-general-onnx
//
// Why ISNet and not the newer BiRefNet-lite (also MIT)? Both were tested in a
// real browser during development. BiRefNet-lite's Swin-transformer graph
// exhausts WASM memory at inference time (std::bad_alloc) in every WASM
// configuration tried — a fallback that runs out of memory is worse than a
// slightly softer model that runs everywhere. ISNet's convolutional graph
// runs reliably on WASM and WebGPU alike, at the same 1024×1024 input size,
// and its fp16 weights produce masks identical to fp32 on WASM (verified:
// same transparent/opaque fractions to 2 decimal places), so one 88 MB file
// serves both execution providers. MODNet was rejected: it is specialised
// for portraits and the core audience here is product photography.
//
// The exact revision is pinned so the model can never change under users.
// The file is fetched once, kept in Cache Storage, and reused on every later
// visit — that is what makes "works offline after the first download" true.

import type { Normalization } from "./mask";

export const MODEL = {
  displayName: "ISNet (general-use)",
  repo: "imgly/isnet-general-onnx",
  revision: "440dea96dd4a3b06bbbf5abec3e26569dd7ec49f",
  file: "onnx/model_fp16.onnx",
  /** Exact byte size of the pinned file, for honest progress reporting. */
  bytes: 88_152_708,
  license: "MIT (model repo) · ISNet/DIS project: Apache-2.0",
  /** The model takes a fixed square input; the photo itself is never resized. */
  inputSize: 1024,
  /** ISNet normalisation: (pixel - 128) / 256 on raw 0..255 values. */
  normalization: {
    scale: 1,
    mean: [128, 128, 128],
    std: [256, 256, 256],
  } satisfies Normalization,
} as const;

export const MODEL_URL = `https://huggingface.co/${MODEL.repo}/resolve/${MODEL.revision}/${MODEL.file}`;

const CACHE_NAME = "cutout-model-v1";

export type ModelProgress = (loaded: number, total: number) => void;

/**
 * Fetch the model bytes, from Cache Storage when a previous visit already
 * downloaded them, otherwise from Hugging Face with streaming progress.
 * Cache failures (private mode, storage pressure) degrade to a plain
 * download — the cache is an optimisation, never a requirement.
 */
export async function fetchModelBytes(onProgress: ModelProgress): Promise<ArrayBuffer> {
  const cache = await openCache();
  if (cache) {
    try {
      const hit = await cache.match(MODEL_URL);
      if (hit) {
        const buffer = await hit.arrayBuffer();
        onProgress(buffer.byteLength, buffer.byteLength);
        return buffer;
      }
    } catch {
      // A broken cache entry must not block the download path.
    }
  }

  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    throw new Error(
      `Model download failed (HTTP ${response.status}). Check your connection and retry.`,
    );
  }
  const total = Number(response.headers.get("content-length")) || MODEL.bytes;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  if (cache) {
    try {
      await cache.put(MODEL_URL, new Response(buffer.slice().buffer));
    } catch {
      // Storage full or unavailable — the model still works this session.
    }
  }
  return buffer.buffer;
}

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === "undefined") return null;
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}
