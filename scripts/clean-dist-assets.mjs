// Remove the WASM binaries Vite emits into dist/assets/ as a side effect of
// bundling onnxruntime-web (its code references them via new URL()).
//
// They are duplicates: the app always loads the runtime binaries from
// /ort/ (see scripts/copy-ort-assets.mjs and the wasmPaths map in
// src/lib/engine.ts), which this script leaves untouched. Deleting the
// bundled copies halves the deploy size. The end-to-end browser test runs
// against this exact dist, so a mistake here fails loudly, not silently.

import { readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "assets");
for (const file of readdirSync(assetsDir)) {
  if (file.startsWith("ort-wasm-") && file.endsWith(".wasm")) {
    rmSync(join(assetsDir, file));
    console.log(`clean-dist: removed duplicate ${file}`);
  }
}
