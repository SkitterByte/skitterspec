---
linear_issue_id: "SKS-174"
---

# Phase 2 — `skitterspec status` ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** one obvious command answers "what is being worked on here", and the
existing one answers it better.

## Tasks

- [ ] Add a top-level `skitterspec status`: list every provisioned spec with its
      real status, phase progress, developer and worktree path, read from the
      worktree (phase 1's reader).
- [ ] Print the reason the buckets disagree as a closing line — a spec's status
      lives on its own branch, so this branch reads `backlog` for in-flight work
      (Decision 3). Print it **only when at least one spec is in flight**; on an
      idle repo it would be explaining a discrepancy that is not there.
- [ ] Enrich `spec-env status` with the same detail, keeping its port-block
      reporting and its name. Nothing that works today may stop working.
- [ ] Add `--json` carrying the same fields, so a script or a skill can read it
      without parsing the human output.
- [ ] Keep it **offline and instant** — no tracker call, ever (non-goal).
- [ ] Say "no specs in flight" plainly when there are none, and exit 0. An empty
      repo is an ordinary state, not a finding.
- [ ] Add it to `--help` and the usage line.
- [ ] Tests: a repo with two worktrees at different phases; one whose spec file is
      unreadable (listed, marked unknown); none at all; `--json` shape; and a
      stays-silent case asserting `spec-env status`'s existing output is a superset
      of what it printed before.
- [ ] Run `pnpm test` in `packages/common` and at the repo root — green before the
      phase is done.

## Notes

`/spec-status` is already taken by the Linear provider (a drift report) — hence a
CLI command rather than a skill, and hence the name `status` rather than anything
that would collide with it.
