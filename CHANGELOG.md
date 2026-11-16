# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-16

### Added

- **Background removal in the browser** — the ISNet (general-use) segmentation
  model running on-device via onnxruntime-web: WebGPU when available, WASM
  otherwise, single-threaded fallback without cross-origin isolation. The
  88 MB fp16 model downloads once, is cached in Cache Storage, and works
  offline afterwards.
- **Full-resolution output** — the model's mask is upscaled and feathered,
  then applied to the original pixels; photos are never downscaled by the
  cut-out step. Before/after comparison slider with an export-accurate
  preview.
- **Batch mode** — multi-photo queue with per-item status; failures are
  per-item with honest reasons and retry. Shared background (transparent /
  white / custom colour), marketplace size presets (Amazon 2000px, eBay
  1600px, Etsy 2700px, Shopify 2048px — shrink-only, never upscale), PNG or
  JPG export, and download-all as a single zip with de-duplicated names.
- **Honest limits** — unsupported/undecodable files and photos over
  120 megapixels are refused with explanations; model-load failures offer a
  retry. No uploads, no accounts, no watermark, no analytics.
