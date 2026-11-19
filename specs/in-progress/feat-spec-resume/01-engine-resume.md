---
github_issue_id: "#242"
---

# Phase 1 — Engine: `Blocked on:` reader, `#N` across branches, `spec-env resume` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a single engine call that says which spec a name or `#N` means,
whether it can be resumed, what provisioning it needs and what it is blocked
on. Proven by unit tests.

## Tasks

- [x] Add `blockers(specDir)` (beside `specstate.js`/`phases.js`): read
      `> **Blocked on:**` from `00-overview.md` and each phase file, returning
      `{ where: 'spec'|phaseN, text, until? }`. A malformed `until` is
      kept as text and never read as a date (cannot-tell).
- [x] Extend `spec-sync linked` in github, linear and azure-boards (jira ships
      no `linked`) to
      include specs found only on local/remote-tracking spec branches
      (reuse `specbranches.js`, never fetch), with each row marked `source`.
- [x] Add `spec-env resume <name|#N> [--json]`: resolve the spec, refuse unless
      it is in `in-progress` (naming the bucket, plus `/spec-start` for
      backlog), report the worktree as present or missing, print the
      `up`/`bootstrap` plan when missing (attach only, never `-b` with no
      branch), and include `blockers`. With no branch anywhere it refuses.
- [x] A `#N` with no linked spec refuses and names nothing. Without a provider
      a `#N` refuses with that reason.
- [x] Tests: name and `#N` resolve; branch-only spec found; backlog, complete
      and cancelled refused; missing worktree yields an attach plan; existing
      worktree yields none. Stays-silent cases: a spec with no `Blocked on:`
      line reports no blockers; an unknown `#N` never falls back to a sole
      spec. Run `pnpm -r typecheck` (if present) and `pnpm test`, green.

## Notes

- `spec-env up` cannot resolve a spec that is only on its branch, so resume
  plans the attach itself (`env/resume.js` `planResume`): `git worktree add`
  on the local branch, or fetch plus `--track` on the remote one, then
  `spec-env bootstrap`. It never uses `-b` without a branch to attach.
- A `#N` is matched against each copy's frontmatter through
  `branch.identifierField`, so the base engine needs no provider. `linked` is
  the provider-side listing, used by the `/spec` doors.
- `/spec-todo` and the summary projection read the same `blockers()`, so its
  output shape is the contract for phase 4.
