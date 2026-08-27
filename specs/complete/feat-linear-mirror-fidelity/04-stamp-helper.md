# Phase 4 — `spec-sync stamp` helper + move both call-sites ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** id stamping moves out of skill prose and into the engine, validating
every ref and id before writing anything; proven by CLI tests including the
half-stamp failure case.

## Tasks

- [x] Add `specSyncStamp` to `packages/linear/src/cli-sync.js`:
      `spec-sync stamp <spec> --issue KEY-N [--url URL] --sub <ref>=KEY-M …`
      (`--sub` repeatable). Extend the flag parser for repeatable `--sub`.
- [x] Validate **all** inputs before any write (Decision 8): each `--sub` ref
      resolves to a real phase file in the spec folder; each id matches
      `/^[A-Za-z][A-Za-z0-9]*-\d+$/`; `--url` is a plausible URL. On any failure,
      write nothing, report every problem at once, exit non-zero.
- [x] Write via the existing `write.js` helpers — `writeFrontmatter` for
      `linear_identifier`/`linear_url` on the overview, `stampSubIssueId` per
      phase file. Report what was written (`ref → id`, path-relative).
- [x] Keep `record` a separate call (Decision 8) — no `--record` flag.
- [x] Add `stamp` to the `spec-sync` usage line and the header comment's
      subcommand list.
- [x] Rewrite `/spec-push` steps 4–5
      (`packages/linear/assets/skills/spec-push/SKILL.md`) to collect the
      returned ids and make **one** `spec-sync stamp` call, then `record` — the
      per-file hand-stamping prose goes away.
- [x] Rewrite the same stamping instructions in
      `packages/linear/assets/seams/spec-tracker-link.md` (used by `/spec` at
      creation time) to call `spec-sync stamp` (Decision 9).
- [x] Tests in `packages/linear/test/`: a happy path stamps overview + N phase
      files; an unknown `--sub` ref writes **nothing** and exits non-zero; a
      malformed id writes nothing; re-stamping an existing id overwrites and
      reports it; `stamp` on a spec with no Linear config exits 0 with the
      opt-in message like the other subcommands.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

**Found a pre-existing bug: the bin discarded every exit code.**
`bin/skitterspec-linear.js` ran `await specSync(rest)` without assigning the
result, while `spec-sanitise` two lines below correctly set `process.exitCode`.
So `stamp`'s refusal exited 0 — and so, all along, did
`spec-sync status --workspace-states` when a configured state name is missing
from the workspace, which `/spec-push` step 3 explicitly relies on to stop before
applying a plan. Fixed by propagating the code, and guarded in
`bin-resolves.test.js`, which spawns the bin. The unit tests never caught it
because they assert the value `specSync` *returns* — the value nothing read.

**`--issue` is optional.** The task implied it was required. A push that only
creates sub-issues (the spec issue already exists) has no issue id to stamp, so
requiring it would force a fake argument. Passing neither `--issue` nor `--sub`
is an error rather than a silent no-op.

The all-or-nothing rule is the point: the failure this replaces is a mistyped id
that re-mints a duplicate Linear issue on the next push, so a partially-applied
stamp would be worse than none.

`stampIssueId` (inline task-line ids) is legacy and stays untouched — tasks are
not individually linked.
