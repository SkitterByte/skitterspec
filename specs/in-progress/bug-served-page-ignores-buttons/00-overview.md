# Bug: the served page ignores the button set it was rendered with

> **Type:** Bug
> **Name:** bug-served-page-ignores-buttons
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-18
> **Area:** `packages/common/src/env/serve.js`, `packages/common/src/env/review.js`, `packages/common/src/cli.js`

## Symptom

A `/no-spec` branch renders its page with `--buttons nospec`, which offers
`Commit & Land` and `Commit`. Opened over http from the review daemon, the same
page offers `Commit & Continue` and `Commit & Start` instead — the committing
set. Pressing one returns a verdict the skill that rendered the page cannot act
on: `commit-continue` names a next phase a specless branch does not have, and
`commit-start` would put a spec in flight that does not exist.

Observed on `docs-catch-up`: the page was rendered `--buttons nospec`, the
served page reported `buttons: None`, and the pass that came back carried
`commit-continue`.
