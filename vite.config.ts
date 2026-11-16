import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// onnxruntime-web runs inference on a WASM thread pool (and WebGPU where
// available). The threaded WASM build needs SharedArrayBuffer, which browsers
// only expose on cross-origin-isolated pages. These two headers provide that
// isolation for `vite dev` and `vite preview`. Production hosts need the same
// headers — see public/_headers (Netlify-style hosts). Without isolation the
// app still works: the engine falls back to a single WASM thread.
const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
});
