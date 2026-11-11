---
github_identifier: "#170"
github_url: "https://github.com/SkitterByte/skitterspec/issues/170"
---

# With a tracker, specs live on their branch, not on main

> **Type:** Feature
> **Name:** feat-tracker-spec-branches (the spec folder name — the handle you paste into `/spec-start`)
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/170
> **Author:** Reuben Greaves
> **Raised:** 2026-11-11
> **Area:** packages/common/src/env/config.js, packages/common/src/cli.js (integrate, specOnForkPoint), packages/common/src/env/specbranches.js (new), packages/common/src/gating.js, packages/common/src/env/epicread.js, scripts/docs-freshness.js, packages/common/assets/skills/spec/SKILL.md, packages/common/assets/skills/spec-cancel/SKILL.md, packages/common/assets/rules/spec-planning.md, packages/common/assets/core/env.config.md
> **Stack:** worktree
> **Docs:** reference

## Summary

When a ticketing provider is attached, a newly written spec no longer has to be
landed on the base branch: it lives on its own pushed branch and reaches the
base with its work. The board is how the backlog is found, and the checks that
read the backlog read those branches too.

## Problem

`/spec` lands every spec on the base branch so that `ls specs/backlog/` can find
it. With a tracker attached that reason is gone — the ticket already exists and,
under `pull`, the board owns status — but the land still happens, and in PR
mode it means a pull request for a document nobody needs reviewed twice.
`land.specDocs: "branch"` already skips the land, but it is opt-in, keeps the
document on one laptop (nothing pushes the branch), and leaves `gating check`,
`epic status` and `docs-freshness check` blind to every spec it produces.

## Acceptance criteria

- In a project with a ticketing provider configured and no `land.specDocs` set,
  `/spec`'s committing verdicts do not touch the base branch.
- Without a provider, or with `land.specDocs` set explicitly, behaviour is
  exactly as today.
- After a plain `Commit`, the spec branch is on the remote once the operator
  consents; a decline is reported as `held — not pushed` and nothing is lost.
- `gating check`, `epic status` and `docs-freshness check` report a spec that
  exists only on a (local or remote-tracking) spec branch.
- Cancelling a never-started branch-mode spec offers to delete its remote
  branch, so it stops being reported as backlog.

## Decisions

1. **Default flips on any provider, regardless of `land.strategy`.** The tracker
   is the backlog under `ff` as much as under `pr`; one rule is easier to
   reason about than a strategy matrix. Rejected: provider **and** `pr` only —
   leaves a trunk land whose only purpose (findability) the tracker already
   serves.
2. **The default only fills an absent key.** An explicit `"trunk"` or
   `"branch"` always wins, so a project can opt back out with one line.
3. **Provider detection is a positive signal** — a provider config file present
   under `specs/.core/` (registered by the provider's own bin). Unreadable or absent
   is cannot-tell and resolves to `"trunk"`, today's behaviour
   (`.claude/rules/negative-checks.md` rule 4).
4. **Both committing verdicts push the spec branch, consent-gated** — the hotfix
   pattern: already-pushed is honoured, `--push` is the recorded yes, otherwise
   the plan holds. Pushed, the branch is the content's home; the ticket in
   `summary` mode cannot rematerialize a spec. No PR is opened.
5. **Backlog discovery reads spec branches with git, not the tracker.** Branches
   matching `branch.pattern`, local and remote-tracking, read with
   `git cat-file` — full headers (`Docs:`, `Gating:`, `Waits on:`) and no
   provider code in the checks. Rejected: `spec-sync list` — needs network and
   credentials, and summary blocks carry neither `Docs:` nor `Waits on:`.
6. **No fetch inside an advisory check.** Remote-tracking refs are read as they
   stand; the report says "as of last fetch". The engine never fetches the base
   implicitly today, and a check that can hang on the network is worse than a
   slightly stale one.
7. **Precedence when a spec appears in several places:** the base branch's
   `complete/` or `cancelled/` wins (the work is done); otherwise a local
   branch, then a remote-tracking branch, then the base's own `backlog/`.
8. **Cancel deletes the remote branch, on consent.** A never-started branch-mode
   spec has no other copy and no base record — left on the remote, discovery
   would report a cancelled spec as backlog forever. The ticket carries the
   cancellation.

## Solution overview

`config.js` resolves `land.specDocs` after parsing: explicit value, else
`"branch"` when a provider config is present, else `"trunk"`. Everything that
already branches on `specDocs === 'branch'` (`specOnForkPoint`, `/spec`'s
verdict path, `/spec-complete`'s lane) follows without change.

`spec-env integrate` under branch mode plans a push of the spec branch instead
of a rebase + fast-forward, with the hotfix consent shape. `/spec` relays it for
both verdicts and reports `Landed: pushed <remote>/<branch>` or
`held — not pushed`.

A new `specbranches.js` lists `{ folder, bucket, ref, overview }` for every spec
folder found on matching branches; `gating.js`, `epicread.js` and
`scripts/docs-freshness.js` merge it into their bucket scan with the precedence
in decision 7. In trunk mode with no matching branches it returns nothing and
the checks are byte-identical to today.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | update | `land.specDocs` default: `"branch"` when a provider is configured |
| CLI command | update | `spec-env integrate` — branch mode plans a consent-gated push |
| CLI command | update | `gating check`, `epic status` — include spec-branch-only specs |
| Script | update | `scripts/docs-freshness.js check` — same |
| Skill/rule | update | `/spec` verdict reporting, `/spec-cancel` remote-branch delete, `spec-planning.md`, `env.config.md` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Default `specDocs` to branch when a provider is configured | ✅ | [01-provider-default.md](01-provider-default.md) |
| 2 | Push the spec branch on the verdict; delete it on cancel | ⬜ | [02-push-and-cancel.md](02-push-and-cancel.md) |
| 3 | Backlog checks read spec branches | ⬜ | [03-branch-discovery.md](03-branch-discovery.md) |

## Open questions

- [ ] None

## Changelog

- 2026-11-11 — Spec created. Default deliberately covers `ff` too (decision 1),
  which changes this repo's own `/spec` flow once released.
- 2026-11-11 — Phase 1: provider detection is a `setProviderConfigFile` seam
  registered by each provider bin, not a filename list in provider-kit —
  it mirrors `setProviderEnvDefaults` and keeps common tracker-free.
  `ENV_CONFIG_DEFAULTS` left alone so the composed example does not pin
  `specDocs` explicitly.
