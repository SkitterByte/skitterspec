# Phase 1 — Engine lists unpushed live specs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `spec-sync list` prints a `local only — not linked on this branch`
section and a `local[]` JSON field for unpushed specs in the live buckets.
Proven by `packages/linear/test/cli-list.test.js`.

## Tasks

- [x] Write the failing tests first, in `cli-list.test.js`:
  - An unlinked spec in `backlog/` appears in the section and in `local[]`, with a `/spec-push <name>` hint.
  - `showing N of M` is unchanged by it.
  - `--in-progress` shows only the `in-progress` bucket, and `--next 1` shows only `backlog`, uncapped.
  - `--mine` and `--by` print the hidden-count line, carry `localHidden`, and list no local rows.
- [x] Add the stays-silent tests (`.claude/rules/negative-checks.md` rule 3):
  - An unlinked spec in `complete/` or `cancelled/` never appears, under `--all` too.
  - When every live spec is linked, the section prints nothing, not even its heading.
- [x] In `specSyncList`, partition `listSpecs()` into linked (`byIdentifier`) and `local`, filtered to the scope's buckets (decisions 3–4). Add a comment beside the check that names the blind spot behind decision 2.
- [x] Print the section after the rows, then add `local` / `localHidden` to the JSON output.
- [x] Run `pnpm -r typecheck` (where defined) and `pnpm test`, and get them green.
