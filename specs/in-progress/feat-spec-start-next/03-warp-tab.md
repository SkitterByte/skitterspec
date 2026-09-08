---
linear_issue_id: "SKS-89"
---

# Phase 3 — The Warp tab hand-off ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** with `open.tab: "warp"`, the hand-off is a tab in the current window
whose shell lives in the worktree and whose Claude is already running
`/spec-next`.

## Tasks

- [ ] Add `open.tab` to `env/config.js` (`"warp"` | `""`, default `""`;
      unrecognised falls back to `""` — the deleteRemoteBranch precedent), plus
      example + `env.config.md` docs (name the fresh-session trade explicitly).
- [ ] Add `spec-env tab <name>`: locate Warp's tab-config directory (verify the
      real path on macOS/Linux at implementation; missing → fallback report),
      write `spec-<slug>.toml` (`name`, one terminal pane, `directory` =
      worktree, `commands` = [`claude "/spec-next"; exit`]), overwrite
      idempotently. The trailing `exit` is the tab's whole lifecycle policy:
      Warp closes a tab when its shell exits, and nothing can close it from
      outside — so ending the Claude session ends the tab, and a completed
      spec's tab disappears with one `/exit` instead of lingering on a deleted
      directory,
      then open `warp://tab_config/spec-<slug>` via `open`. Executes, not
      prints; on any failure report and print the manual hand-off instead —
      never refuse provisioning over a viewer.
- [ ] Add `open.tabRemote` (boolean, default false): when true the tab command
      becomes `claude --remote-control "/spec-next"; exit`, so a tab opened
      while phone-driving still appears in the operator's claude.ai session
      list. Document beside it that a heavy phone user can instead set
      `remoteControlAtStartup: true` in `~/.claude/settings.json` and leave this
      off — every session, tabs included, then starts reachable.
- [ ] File `/feedback` requesting a scriptable remote-control signal (env var or
      `claude status --json`), and note in the skill that `--remote` becomes
      auto-detection when one ships.
- [ ] Guards, refusing or degrading by name: checkout mode (nothing to hand
      off), no worktree (`/spec-start` first), spec live (the primary checkout
      already is the session).
- [ ] Add planner tests: toml shape (directory + the exact `claude "/spec-next"`
      command), idempotent rewrite, fallback chain on unset/failed, guards fire,
      stays-silent on an ordinary provisioned spec; run `pnpm build` +
      `pnpm test` — green before the phase is done.
