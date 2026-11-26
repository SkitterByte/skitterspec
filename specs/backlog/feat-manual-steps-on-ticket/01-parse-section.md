---
github_issue_id: "#326"
---

# Phase 1 — Parse the `## Manual steps` section ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** phase files yield `manualSteps` from a `## Manual steps` section, and
legacy files yield an empty list. Proven by unit tests, with no projection
change yet.

## Tasks

- [ ] Parse `## Manual steps` in `readPhaseFiles`
      (`packages/sync-core/src/normalize.js`) into
      `phase.manualSteps: [{ text, done, code: [{ lang, body }] }]`, using
      `fenceMask` so a section shown inside a fence is ignored
- [ ] Attach each indented fenced block to the step above it, keeping the
      body byte-for-byte and its info string as `lang`
- [ ] Keep the steps as ordinary task blocks too, so progress counts and the
      existing body projection are unchanged in this phase
- [ ] Document the section in `packages/common/assets/rules/spec-format.md`:
      the shape, steps that carry code, and the fact that inline legacy steps
      stay valid
- [ ] Tests: section with code, section without code, mixed marks (`[x]`,
      `[~]`), section inside a fence (ignored), and a legacy inline file that
      yields `[]` (the stays-silent test); run `pnpm test`, green
