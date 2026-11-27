---
github_identifier: "#348"
github_url: "https://github.com/SkitterByte/skitterspec/issues/348"
---

# Retire `/spec-connect`; `/spec-live` is the one way to try a spec

> **Type:** Feature
> **Name:** feat-drop-spec-connect (the spec folder name — the handle you paste into `/spec-start`)
> **Author:** Reuben Greaves
> **Raised:** 2026-11-27
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/348
> **Area:** packages/common/src/cli.js, packages/common/src/env/{proxy,live,config,deprecate}.js, packages/common/src/init.js, packages/common/assets/commands/spec-connect.md, packages/common/assets/{claude-md-section.md,rules/spec-planning.md,core/env.config.md}, packages/common/assets/skills/{spec-start,spec-next,spec-hotfix,spec-complete,spec-cancel}, packages/*/MIGRATION.md, docs/{index,reference}.html
> **Stack:** worktree
> **Epic:** epic-live-workbench
> **Waits on:** feat-drop-docker-stacks, feat-live-db-snapshot
> **Docs:** index, reference

## Summary

`/spec-connect` and its bundled proxy are removed. `/spec-live` is the single
way to try a spec on your usual localhost ports, migrations included. A spec's
own dev servers stay reachable on their own ports through `spec-env dev up`.

## Problem

There are two commands for "try this spec on localhost". With Docker stacks
gone and live able to snapshot the database, `/spec-connect` differs from
`/spec-live` only in which process serves the code. It still costs a supervised
proxy, a `proxy` config block, a `.spec-env/connected` state file that
complete and cancel must clean up, and a choice the reader has to make.

## Acceptance criteria

- `/spec-connect` is no longer installed. `skitterspec spec-env connect` exits
  with one line pointing at `/spec-live`.
- No refusal, skill or doc names `/spec-connect`.
- `/spec-live` still probes the canonical dev ports on the configured host.
- A hotfix (which live refuses) can still be tried, on its own dev ports
  through `spec-env dev up <hotfix>`.
- `/spec-complete` and `/spec-cancel` no longer stop a proxy.

## Decisions

1. **Drop connect rather than folding it in as `/spec-live --own`.** Its only
   remaining use, keeping a dirty primary checkout untouched, is served by
   the spec's own ports through `spec-env dev up`, and that needs no proxy.
2. **Keep `spec-env dev up/down` and the port blocks.** A hotfix is built on
   an old tag and its schema cannot run under base's database, so its own
   ports are how it gets tried.
3. **`proxy.host` becomes `live.host`.** Live's dev-server probe and the review
   page's `live:` URL read it. `proxy.host` is a fallback, with a notice, and
   the rest of `proxy` is ignored.
4. **Remove the installed command through the deprecation path.** An upgrade
   removes `.claude/commands/spec-connect.md` the same way earlier retired
   assets were removed (`deprecate.js`, `init.js`), and keeps it if it was
   edited.
5. **Cancel `feat-connect-planner` (#17) when this starts.** It adds a planner
   to the verb this removes.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | remove | `spec-env connect [spec\|off]` (stub that points to `/spec-live`) |
| Slash command | remove | `/spec-connect` |
| Config key | remove | `proxy.*` (ignored, with notice) |
| Config key | add | `live.host` |
| File | remove | `src/env/proxy.js`, `.spec-env/connected`, `proxy.json` |
| Skill/rule | update | spec-start, spec-next, spec-hotfix, spec-complete, spec-cancel, spec-planning, claude-md-section, isolation.md |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done · ➖ cancelled.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Engine drops connect and the proxy | ⬜ | [01-engine.md](01-engine.md) |
| 2 | Assets and docs point at `/spec-live` | ⬜ | [02-assets-docs.md](02-assets-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-27 — Spec created as member 3 of epic-live-workbench.
