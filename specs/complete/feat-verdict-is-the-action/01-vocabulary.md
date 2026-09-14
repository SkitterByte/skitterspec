---
linear_issue_id: "SKS-234"
---

# Phase 1 — The vocabulary in the engine ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine speaks in actions — `commit`, `commit-continue`, `changes`,
`discuss` — reads an old `approve` as `commit`, and no longer offers a way to
configure a verdict that does nothing.

## Tasks

- [x] Rename `approve` → `commit` in `VERDICTS`, and add `commit-continue`.
      `DEFAULT_VERDICT` stays `discuss`: an absent verdict must keep meaning what
      it always meant (`feat-review-verdict` Decision 2).
- [x] **Read a stored `approve` as `commit`** wherever a sidecar is loaded — the
      outcome log and any pass written before this. Sidecars are gitignored, so
      this is tolerance, not migration, and it belongs at the read rather than in
      a one-off script nobody will run.
- [x] Block `commit-continue` on an open comment exactly as `commit` is blocked,
      in `judgeVerdict` — a refused one routes to `discuss` like its sibling. Do
      **not** add a second code path: one rule, two verdicts that trip it.
- [x] Keep the refusal counting **comments only**. Unaccepted files still block
      nothing; `feat-review-verdict` Decisions 1 and 3 are untouched by this spec
      and a new verdict must not become an excuse to revisit them.
- [x] Say the new words on the CLI's verdict line and in `--json` — `committed`,
      `committing and continuing`, `changes requested`, `discuss first` — and
      keep naming `review.commitWith` on the ones that commit.
- [x] Remove `"none"` from `review.commitWith`: drop it from the merge, the
      `.example` files and `env.config.md`. An unrecognised value falls back to
      the default as every other key does.
- [x] Tests: the four verdicts validate and an unknown one is refused by name;
      a stored `approve` reads as `commit`; `commit-continue` is blocked by an
      open note and honoured without one; unaccepted files block neither.
- [x] **Stays silent:** a pass carrying no verdict behaves exactly as it does
      today, and a sidecar with no `decisions` gains no key by being read
      (`.claude/rules/negative-checks.md` rule 3).
- [x] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

The rename is the risky half — `approve` appears in tests, prose and stored
sidecars. Do the engine and its tests here and let the page and the skills follow
in phases 2 and 3; a rename spread across three surfaces in one pass is where a
half-renamed vocabulary hides.
