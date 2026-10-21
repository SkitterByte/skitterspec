---
linear_issue_id: "SKS-403"
---

# Phase 2 — `hotfix land` executes: release step + `releaseWith` seam ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `hotfix land` runs its release step itself, through `releaseWith` or the built-in
tagger, and records the result.

## Tasks

- [ ] Add a `hotfix.releaseWith` string to `config.js`, defaulting to empty.
- [ ] Turn `planHotfixLand` into a pure step list (`release`, `push`, `carry`, plus the
  extra-target steps), in the manner of `worktreeSteps`. Add a runner beside it, in the
  manner of `runBootstrap`: it is injected with spawn and git, and stops at the first
  failure.
- [ ] Release step, with `releaseWith`:
  - spawn it in the worktree, with no `--push`;
  - parse stdout strictly into `{tag, version, baseTag, branch, versionCommit, pushed}`;
  - a non-zero exit or a parse failure is a refusal that relays the stderr line, and
    nothing after it runs.
- [ ] Release step, built-in: `git tag <nextTag>` at HEAD, with `versionCommit: null`.
- [ ] Record the release under the spec in the registry. Then a re-run with a recorded
  release and HEAD at its tag skips the release step and says so.
- [ ] `--plan`: describe the steps and run nothing. `--json`: carry each step's outcome.
- [ ] Tests:
  - with `releaseWith` set, no `git tag` runs and the JSON's tag is used;
  - a failing `releaseWith` refuses, with nothing pushed or carried;
  - a non-JSON stdout (for example, a banner line) is a refusal;
  - a re-run resumes;
  - **stays silent:** the default config runs only the built-in tag.
- [ ] Run `pnpm test`; green before the phase is done.
