---
github_issue_id: "#108"
---

# Phase 2 — host adapter + host-aware landed check ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** "landed" is answered by the host where ancestry cannot — a squash or
rebase merge counts as landed; every cannot-tell holds rather than deletes.

## Tasks

- [ ] New `packages/common/src/env/host.js`: detect the host from the remote
      URL (`dev.azure.com`/`visualstudio.com` → `az repos pr`, `github.com` →
      `gh pr`) and expose `prFor(branch)` →
      `{ state: 'merged'|'open'|'draft'|'none'|'cannot-tell', id, url }`.
      Unknown host, missing CLI, non-zero exit, no network → `cannot-tell`,
      silently (name the blind spot beside the check).
- [ ] Compose the PR-create / set-ready / abandon command strings per host in
      the same module, so phases 1, 3 and 4 print from one place.
- [ ] `worktreeGitState` (cli.js): in PR mode `merged` becomes
      `ancestryMerged || prState === 'merged'`; carry `prState` in the state
      object for the skills' reports. Checkout-mode `landed` same.
- [ ] Teardown honours the three-valued answer: `merged` → `-D` and plan the
      remote delete as today; `cannot-tell` with unpushed=false → **block** with
      "cannot confirm the PR merged — check <url>, or pass --force-unlanded",
      never `-D`. Hosts that auto-delete the branch on merge: the remote-delete
      command stays planned but its refusal (branch already gone) is reported as
      a no-op, not a failure.
- [ ] Unit tests: detection table, cannot-tell on every failure shape,
      landed truth table (ancestry × prState), teardown hold on cannot-tell —
      plus stays-silent tests: trunk mode never invokes the adapter; a healthy
      merged-by-ff branch is still landed with no CLI installed.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The adapter shells out (like everything else in the engine) and is called only
when `land.strategy: "pr"` — a trunk project never pays the subprocess. Azure
needs `az devops configure` defaults or an org/project derivable from the
remote URL; derive from the URL, never from extra config.
