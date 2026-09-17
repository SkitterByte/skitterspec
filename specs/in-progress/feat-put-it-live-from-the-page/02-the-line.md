---
linear_issue_id: "SKS-326"
---

# Phase 2 — The page's line, and the action behind it ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the page carries one labelled live line above the verdicts, and a press
reaches the engine as an **action** that no part of the verdict machinery mistakes
for a conclusion.

## Tasks

- [ ] Accept `action: 'live-on' | 'live-off'` on the pass blob in
      `validateNotesBlob`, as an alternative to `verdict` — never both in one
      pass, and neither one defaulting to the other.
- [ ] Keep `VERDICTS` and `COMMITTING` untouched, and assert that in a test: an
      action must be structurally unable to clear an armed gate (decision 2).
- [ ] Record it with `appendDecision`'s log as `{action, at, code}`, so the
      history distinguishes what the engine did from what the reader concluded
      (decision 9).
- [ ] Render the line in `page.html` above the verdict row, from the `live` key
      the render now carries — state, the one action that changes it, and the
      running URL when there is one. Visually separate from the verdicts.
- [ ] Show it on the `committing` and `midrun` sets only; `authoring` and
      `refresh` get **no line** (decision 6). On `midrun` with a dirty tree the
      action is unavailable and the line says the phase must land first
      (decision 7).
- [ ] Relay a refusal verbatim on the page — the workbench held by another spec,
      a hotfix, a stateful spec, migrations, no dev server — with the engine's
      own way out, never a worked-around one (decision 5).
- [ ] Tests: the blob accepts an action and rejects an action-plus-verdict; the
      line renders per state and per button set; a refusal reaches the page
      unedited.
- [ ] **Stays-silent test**: a `--docs` render carries no live line and no
      explanation of why, and an `unavailable` state renders nothing.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The page can queue a pass and nothing more, and that limit is what makes the
open port defensible — so this is the first control on the page that causes the
engine to *do* something beyond storing what you said. It is worth noticing that
the guard is unchanged: the serve token still decides who may POST at all, and
the action is bounded to this spec's own branch.
