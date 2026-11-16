# Contributing to Cutout

Thanks for being here. Cutout exists so sellers and creators can remove photo
backgrounds without uploading their photos to a subscription service —
contributions that protect that promise are very welcome.

## Ground rules

- **Privacy is the product.** Never add analytics, tracking, or any network
  call that could carry a user's photo (or facts about it) off the device.
  The only permitted fetch is the pinned model file. A feature that needs a
  server is a feature we don't ship.
- **Full resolution is the promise.** Never silently downscale a user's
  photo. Limits (like the 120-megapixel decode ceiling) are stated to the
  user, not worked around behind their back.
- **Every feature must actually work.** No stubs, no greyed-out "coming
  soon" buttons. Small and finished beats large and hypothetical.
- **The pure logic goes in `src/lib/`, the UI stays thin.** If a piece of
  behaviour can be expressed as a pure function, it lives in `lib` and gets
  unit tests. This is what keeps the project maintainable by very few people.
- **Permissive licences only.** Dependencies and models must be MIT /
  Apache-2.0 / BSD or similar. AGPL code and non-commercial model weights
  are not acceptable here — check the licence on the model repo itself, not
  on a blog post about it.

## Development setup

You need Node.js 20 or newer (the project is developed on Node 24).

```bash
npm install
npm run dev
```

Before opening a pull request:

```bash
npm run lint
npm test
npm run build
```

If you touch the engine or the model pipeline, also verify the production
build in a real browser with a real photo — the unit tests cover the maths,
not ONNX Runtime.

## Changing the model

The model URL and revision are pinned in `src/lib/model.ts`. Bumping the
revision is a deliberate, reviewed change: record the new file size, verify
the licence still holds on the model repo, and re-run the browser
verification (fp16/fp32 mask equivalence is not guaranteed across exports).
