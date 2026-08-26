# Bug: Linear round-trip corrupts markdown emphasis that spans a line break

> **Type:** Bug
> **Status:** Complete (2026-08-26)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-26
> **Area:** packages/sync-core/src/{task-block,normalize,sanitise}.js,
> packages/linear/src/cli-sanitise.js, packages/linear/bin/skitterspec-linear.js

## Symptom

Linear normalises markdown on save and corrupts inline emphasis whose markers
straddle a hard line break. Empirically verified against Linear's API:

| Sent | Returned | |
|---|---|---|
| `**bold on one line**` | unchanged | ok |
| `**bold crossing`⏎`a break**` | `**bold crossing****`⏎`****a break**` | corrupted |
| `*italic crossing`⏎`a break*` | `*italic crossing**`⏎`**a break*` | corrupted |
| `` `code crossing`⏎`a break` `` | joined onto one line | harmless |
| `[link crossing`⏎`a break](url)` | split into two separate links | corrupted |

Rule: **`**`, `*`, and link text must not straddle a newline.** Code spans are fine.

Spec files are hand-wrapped prose, so straddles are common. Two defects:

- **A (regression in 5003dc9):** `renderTaskBlock` wraps on word boundaries with
  no regard for emphasis spans, so re-wrapping a task on `/spec-pull`
  *manufactures* a straddling span, which the next push feeds Linear to mangle.
- **B:** nothing canonicalises the mangled form, so an already-mangled remote
  (`x **a****`⏎`****b** y`) classifies as `remote-only`/`pullable`, and
  `/spec-pull` writes the `****` artifacts into `00-overview.md` — corruption of
  the source of truth.

## Root cause

- **A** — `packages/sync-core/src/task-block.js` `renderTaskBlock` wrapped purely
  on word boundaries (`task-block.js:73` in 7.0.1), breaking a line wherever the
  width was exceeded even if that gap sat inside a `**…**` / `*…*` / `[…](…)` span.
- **B** — `canonicalizeMarkdown` (`normalize.js`), applied to `description` on
  both sides before the three-way compare, only unified list markers and
  whitespace. It never touched emphasis-across-a-break, so the clean local form
  and Linear's mangled form hashed differently → a spurious `remote-only` diff.

## Fix

- [x] Failing tests first (RED) for A and B — `test/sync-emphasis-linebreak.test.js`.
- [x] **A** — make wrapping emphasis-aware: extract `wrapEmphasisAware` +
      `spanMask` in `task-block.js`; a break is only taken at a word gap OUTSIDE
      every span, and an over-width single span overflows rather than splits.
- [x] **B** — extend `canonicalizeMarkdown`: `joinEmphasisAcrossBreaks` repairs
      Linear's `****`/`**` mangle artifacts and joins clean straddles onto one
      line, via an open/close **scanner** (`joinOpenSpans`) that ignores code
      spans and never mis-pairs an opener with an unrelated closer. Applied to
      both sides in the normalize layer (compare.js is field-type-agnostic — this
      is a markdown concern), so a mangled remote reads as in-sync.
- [x] Round-trip / property tests: `render → parse → render` stable, and no
      `renderTaskBlock` output ever straddles.
- [x] Lower-priority: `inferWidth` now ignores table rows and fenced code, so one
      wide table row no longer inflates the prose wrap column.
- [x] **One-time sanitiser** (the extra ask): `sanitizeSpecMarkdown` (sync-core)
      reflows only blocks that actually straddle — minimal-diff, idempotent, tables
      /code/headings untouched — behind `skitterspec-linear spec-sanitise [paths]
      [--write]` (dry-run + exit 1 by default). Validated on this repo's 93 specs
      (41 spans/25 files; second pass clean).
- [x] Full suite green: **452** (431 at 7.0.1 + 21 new); dist build bundles it.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec-linear spec-sanitise [paths…] [--write] [--width N]` |
| Domain object | update | `task-block.js`: `renderTaskBlock` emphasis-aware; new `wrapEmphasisAware`, `spanMask`; `inferWidth` skips tables/code |
| Domain object | update | `normalize.js`: `canonicalizeMarkdown` repairs/joins emphasis across breaks (`joinEmphasisAcrossBreaks`, `joinOpenSpans`) |
| Domain object | add | `sync-core/src/sanitise.js` → `sanitizeSpecMarkdown` (exported from index) |
| Business rule | add | Payload pushed to Linear (and the compare) carries no straddling `**`/`*`/link span |
| Skill/rule | update | Authoring convention added to `spec-planning.md`: never let emphasis/link cross a line break |

## Follow-ups (out of scope here)

- Release tooling can't distinguish *tagged-and-published* from *tagged-but-
  publish-failed* ("release already cut") — bit us on 7.0.1. Harden separately.
- Cut a patch release (`7.0.2`); the consuming project pins `^7.0.1`.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-26 | In Progress | in-progress | Reuben Greaves |
| 2026-08-26 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-08-26 — Bug reproduced; failing tests added (red) for A and B.
- 2026-08-26 — Fixed A (emphasis-aware wrapping) and B (canonicalise
  emphasis-across-a-break, both sides); tests green.
- 2026-08-26 — Replaced regex clean-join with an open/close scanner after a
  real-file dry-run showed a closer being mis-paired with a later opener.
- 2026-08-26 — Added the one-time `spec-sanitise` CLI + `sanitizeSpecMarkdown`;
  fixed a table-detection bug (a `|` inside inline code shielded a whole list).
- 2026-08-26 — `inferWidth` ignores table/code lines. Full suite 452 green.
- 2026-08-26 — Completed; all phases done, tests green (452/452, incl. the
  originally-failing A/B tests). Deferred (noted as follow-ups): cut `7.0.2`,
  harden the release tooling's "release already cut" check.
