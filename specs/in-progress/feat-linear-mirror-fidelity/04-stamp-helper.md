# Phase 4 — `spec-sync stamp` helper + move both call-sites ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** id stamping moves out of skill prose and into the engine, validating
every ref and id before writing anything; proven by CLI tests including the
half-stamp failure case.

## Tasks

- [ ] Add `specSyncStamp` to `packages/linear/src/cli-sync.js`:
      `spec-sync stamp <spec> --issue KEY-N [--url URL] --sub <ref>=KEY-M …`
      (`--sub` repeatable). Extend the flag parser for repeatable `--sub`.
- [ ] Validate **all** inputs before any write (Decision 8): each `--sub` ref
      resolves to a real phase file in the spec folder; each id matches
      `/^[A-Za-z][A-Za-z0-9]*-\d+$/`; `--url` is a plausible URL. On any failure,
      write nothing, report every problem at once, exit non-zero.
- [ ] Write via the existing `write.js` helpers — `writeFrontmatter` for
      `linear_identifier`/`linear_url` on the overview, `stampSubIssueId` per
      phase file. Report what was written (`ref → id`, path-relative).
- [ ] Keep `record` a separate call (Decision 8) — no `--record` flag.
- [ ] Add `stamp` to the `spec-sync` usage line and the header comment's
      subcommand list.
- [ ] Rewrite `/spec-push` steps 4–5
      (`packages/linear/assets/skills/spec-push/SKILL.md`) to collect the
      returned ids and make **one** `spec-sync stamp` call, then `record` — the
      per-file hand-stamping prose goes away.
- [ ] Rewrite the same stamping instructions in
      `packages/linear/assets/seams/spec-tracker-link.md` (used by `/spec` at
      creation time) to call `spec-sync stamp` (Decision 9).
- [ ] Tests in `packages/linear/test/`: a happy path stamps overview + N phase
      files; an unknown `--sub` ref writes **nothing** and exits non-zero; a
      malformed id writes nothing; re-stamping an existing id overwrites and
      reports it; `stamp` on a spec with no Linear config exits 0 with the
      opt-in message like the other subcommands.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The all-or-nothing rule is the point: the failure this replaces is a mistyped id
that re-mints a duplicate Linear issue on the next push, so a partially-applied
stamp would be worse than none.

`stampIssueId` (inline task-line ids) is legacy and stays untouched — tasks are
not individually linked.
