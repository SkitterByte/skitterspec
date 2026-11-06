---
github_issue_id: "#108"
---

# Phase 2 — host adapter + host-aware landed check ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** "landed" is answered by the host where ancestry cannot — a squash or
rebase merge counts as landed; every cannot-tell holds rather than deletes.

## Tasks

- [x] New `packages/common/src/env/host.js`: detect the host from the remote
      URL (`dev.azure.com`/`visualstudio.com` → `az repos pr`, `github.com` →
      `gh pr`) and expose `prFor(branch)` →
      `{ state: 'merged'|'open'|'draft'|'none'|'cannot-tell', id, url }`.
      Unknown host, missing CLI, non-zero exit, no network → `cannot-tell`,
      silently (blind spot named beside the check; `gh`'s "no pull requests
      found" is kept as a positive `none`).
- [x] Compose the PR-create / set-ready / abandon command strings per host in
      the same module, so phases 1, 3 and 4 print from one place. (Wired into
      integrate's plan: a real create on `none`/`merged`, a the-push-updates-it
      comment on `open`/`draft`, the placeholder on cannot-tell; the plan gains
      a `pr:` line, silent on cannot-tell.)
- [x] Landed check: the CLI folds `prState === 'merged'` into
      `worktreeState.merged` (and checkout-mode `landed`) before planning, PR
      mode only, asked only when ancestry says no. `prState`/`prUrl` ride in the
      state object.
- [x] Teardown honours the three-valued answer: `merged` → `-D` and the remote
      delete as today; an unlanded PR-mode branch is refused at plan time with
      the state named (`open`/`draft` → "lands when the host merges", `none` →
      "has no PR", else "cannot confirm") — never `-D`. `--force` bypasses and
      still plans `-d` (the spec's proposed `--force-unlanded` dropped for the
      existing `--force`, same loud-failure property). Host auto-delete of the
      merged branch documented as a no-op beside the remote-delete plan.
- [x] Unit tests: detection table (github/azure/unknown ×6 URL forms, %20
      decode), state mapping, cannot-tell on every failure shape, newest-PR-wins
      for Azure, command composition + quoting, teardown PR truth table — plus
      stays-silent tests: trunk config untouched by a stray `prState`;
      ancestry-merged PR-mode branch tears down with no adapter call.
- [x] Run `pnpm test` — green (4281 pass) · dist build green.

## Notes

The adapter shells out (like everything else in the engine) and is called only
when `land.strategy: "pr"` — a trunk project never pays the subprocess. Azure
needs `az devops configure` defaults or an org/project derivable from the
remote URL; derive from the URL, never from extra config.
