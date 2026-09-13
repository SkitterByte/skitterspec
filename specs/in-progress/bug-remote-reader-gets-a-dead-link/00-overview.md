# Bug: a remote reader is handed a link that does not open

> **Type:** Bug
> **Name:** bug-remote-reader-gets-a-dead-link (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — reproducing
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-13
> **Area:** packages/common/src/cli.js, packages/common/src/env/{serve,config}.js, packages/common/assets/skills/{spec-diff,spec-next,spec-bug,spec-hotfix}/SKILL.md

## Symptom

`feat-diff-reaches-the-reader` shipped to fix exactly one thing: a `file://` URL
is useless to a reader who is not at the machine that wrote it. Detection works —
the engine correctly reports `reader: remote (bridge session)`. But the offer a
remote reader actually receives is still a dead link plus homework:

```
reader: remote (bridge session)
open:   file:///…/feat-skill-report-contract.html   (will not open where you are reading)
serve:  skitterspec spec-env review serve --host 0.0.0.0
```

Reproduced on `feat-skill-report-contract` phase 1, 2026-09-13: the operator,
reading on a phone on the same wifi, got the `file://` link and had to ask why
the feature had not shipped. The server the second line names works perfectly —
started by hand it serves the page in 90KB over the LAN — so every piece of the
fix exists and nothing connects them.
