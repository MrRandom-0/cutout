// Copy the onnxruntime-web WASM binaries + JS glue into public/ort/.
//
// Why: the package's exports map does not expose dist/*.wasm for `?url`
// imports, and the runtime loads these files by name at session creation.
// Serving them same-origin (rather than from a CDN) keeps the
// works-offline-after-first-visit promise. Only the two builds Cutout can
// actually request are copied: the JSEP build (WebGPU entry) and the plain
// threaded build (WASM entry). Runs automatically before `dev` and `build`;
// public/ort/ is git-ignored because the files come from the npm package.

import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "node_modules", "onnxruntime-web", "dist");
const outDir = join(root, "public", "ort");

const FILES = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.jsep.mjs",
];

mkdirSync(outDir, { recursive: true });
for (const file of FILES) {
  copyFileSync(join(distDir, file), join(outDir, file));
  const mb = (statSync(join(outDir, file)).size / 1e6).toFixed(1);
  console.log(`ort assets: ${file} (${mb} MB)`);
}
