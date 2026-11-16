# Screenshots

Real captures only — taken from the production build in a headless Chromium,
with the real model run on a real photo (orange JBL headphones, Pexels). No
mockups, no sample data.

- `home.png` — the tool before any photo is added (light mode).
- `result-light.png` — a completed cut-out with the before/after slider
  (light mode).
- `result-dark.png` — the same state with a dark system theme.
- `batch.png` — two photos processed, batch controls visible.

To re-capture: build (`npm run build`), serve `dist/` with COOP/COEP
headers (`npm run preview`), add the photo, wait for "Done", and shoot at a
1440 × 1000 viewport.
