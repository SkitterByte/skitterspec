# Bug: the review server never starts on Linux

> **Type:** Bug
> **Name:** bug-probe-race-on-linux (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** packages/common/src/cli.js, packages/common/test/env-serve-start-proof.test.js

## Symptom

On Linux the review server never starts. `spec-env review` reports a `file://`
URL and a `serve:` hint even for a reader it has just identified as remote:

```
  reader: remote (configured)
  open: file:///tmp/.../feat-alpha.html   (will not open where you are reading)
  serve: skitterspec spec-env review serve --host 0.0.0.0
```

Five tests fail on CI and pass on macOS.
