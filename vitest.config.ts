import { defineConfig } from "vitest/config";

// Tests cover the pure libraries only (mask maths, preset sizing, batch queue,
// colour helpers), so a plain Node environment is all we need — no DOM
// emulation, no browser. The ONNX engine itself is verified end-to-end in a
// real browser before release (see README).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
