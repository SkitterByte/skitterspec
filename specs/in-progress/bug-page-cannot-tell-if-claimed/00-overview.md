# Bug: the sent page names a command nobody needs to run

> **Type:** Bug
> **Name:** bug-page-cannot-tell-if-claimed (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-16
> **Area:** `packages/common/assets/review/page.html`, `packages/common/src/env/serve.js`, `packages/common/src/env/review.js`, `packages/common/src/cli.js`

## Symptom

A served review page whose POST **succeeded** still ends on
`Sent. Run this where Claude is: /spec-reviewed <code>` — the same sentence it
shows when nothing was delivered. In the normal case a session is waiting and
claims the pass automatically, so the command is noise; in the case that is not
normal it is the only thing that saves the pass, and it looks identical.
