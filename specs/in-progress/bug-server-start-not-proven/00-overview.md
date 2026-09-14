# Bug: the review server reports it started when it did not

> **Type:** Bug
> **Name:** bug-server-start-not-proven (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-14
> **Area:** packages/common/src/cli.js, packages/common/src/env/proxy.js, packages/common/test/env-review-reader.test.js

## Symptom

Every `spec-env review` minted a fresh URL token and reported a server started,
while no server was running at all.
