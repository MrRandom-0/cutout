# Security Policy

## Supported versions

Only the latest release is supported with security fixes.

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

## The security model in one paragraph

Cutout has no backend, no accounts and no uploads: all processing happens in
the visitor's browser. The main risks are therefore (a) a bug that causes a
photo or its contents to be sent somewhere, (b) a dependency or model-file
compromise — the model is pinned to an exact revision and served over HTTPS
for this reason — and (c) hosting misconfiguration, in particular serving
the app without the COOP/COEP headers the threaded WASM build prefers, which
fails closed (single-threaded inference) rather than open.

## Reporting a vulnerability

Please report suspected vulnerabilities privately via GitHub's "Report a
vulnerability" button on this repository (Security → Advisories) instead of
opening a public issue. You should get a response within a few days.
