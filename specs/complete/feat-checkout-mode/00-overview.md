---
linear_identifier: "SKS-77"
linear_url: "https://linear.app/skitterbyte/issue/SKS-77/checkout-mode-end-the-per-spec-hand-off"
---

# Checkout mode — end the per-spec hand-off

> **Type:** Feature
> **Name:** feat-checkout-mode (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** Complete (2026-09-08)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-08
> **Area:** packages/common/src/env (config.js, provision.js, integrate.js, teardown.js, live.js, proxy.js), packages/common/assets/skills (spec-go, spec-complete, spec-to-main, spec-init), packages/common/assets/core (env.config.md, env.config.json.example), packages/common/src/prompts.js
> **Stack:** worktree

## Problem

Every spec costs the operator a terminal hand-off. `/spec-go` provisions the
worktree, then **stops** and tells you to open a session rooted there and re-run
it — because a worktree isolates the *agent's* cwd while the shell stays in the
main checkout, and Warp derives its branch chip and diff panel from the shell's
cwd. Landed today as `8ffa6fc`, that stop is a real fix: the option it replaced
ran whole specs with the diff panel silently describing a clean `main`. But the
remedy is manual and recurs on every spec, and its release note ("hands you into
its worktree") reads as automatic when it is not.

Two things make the tax avoidable. First, `env.config.json` already carries
`open.command` and its own loader comments call an empty value "no auto-open" —
the opener was designed to be *run*, and the skill only prints it, so the
operator copies a path for no reason. Second, the worktree buys parallel specs
and a free `main`; an operator working one spec at a time in a repo with no dev
servers and no Docker pays a session per spec for isolation they never use. The
in-checkout path exists but is reachable only awkwardly — `--no-worktree` builds
on whatever branch you are on (usually `main`, so the branch is lost) and
`/spec-live` requires provisioning a worktree first and then freeing it again.
There is no "give me this spec's branch in the checkout I am standing in".

## Decisions

1. **`/spec-go` runs the configured opener instead of printing it.** `open.command`
   already defaults to `''` and `config.js:249` documents that empty means "no
   auto-open", so running a non-empty value is the behaviour the key was designed
   for. The hand-off still stops and still asks for the re-run — only the
   copy-a-path step goes away. Rejected: printing only, which is today's cost for
   no benefit.
2. **The mode is an explicit config choice, never inferred from absent `dev`/`docker`.**
   Inferring "this operator does not need parallel specs" from "this repo
   configures no dev servers" is exactly the absence-as-evidence mistake
   `.claude/rules/negative-checks.md` was written about: a CLI repo with three
   specs in flight is ordinary, and the lookup cannot see intent. So the operator
   declares it. Rejected: auto-detection, which would silently change how an
   existing repo provisions.
3. **New top-level `mode` key in `env.config.json`: `"worktree"` (default) or
   `"checkout"`.** Defaulting to `worktree` means no installed repo changes
   behaviour on upgrade; `init --isolation` asks, so new adopters make the choice
   deliberately. Rejected: `worktree.mode`, which reads as nonsense when the value
   is "no worktree".
4. **In `checkout` mode `/spec-go` provisions in place:** branch created in the
   primary checkout, no worktree, no bootstrap (dependencies are already
   installed), no `/add-dir`, no hand-off. It requires a clean tree, like the live
   overlay does, so nothing rides onto the new branch by accident.
5. **Landing gets a checkout-mode plan.** `integrate.js:40` hardcodes
   `git -C <worktreePath> rebase`, which has no meaning without a worktree. In
   checkout mode the plan rebases in place, switches to base, and fast-forwards;
   teardown deletes the branch after switching back to base rather than removing a
   worktree.
6. **`/spec-live` and `/spec-connect` refuse in checkout mode, by name.** Both
   exist to route around having the work somewhere other than your checkout, which
   is precisely what checkout mode removes. A refusal saying so beats an error
   about a missing worktree.
7. **One spec at a time is the accepted trade.** Checkout mode cannot hold two
   specs in the working tree; `/spec-go` detects standing on another spec's branch
   and says so rather than switching underneath uncommitted work. Operators who
   want parallel specs keep `worktree`.

## Solution overview

Four passes. The opener automation lands first and alone, because it improves
worktree mode for everyone regardless of the rest. Then the `mode` key with its
loader validation, init prompt and docs. Then `/spec-go`'s in-place provisioning
path. Then the rest of the lifecycle — landing, teardown, and the two refusals —
so a checkout-mode spec completes as cleanly as a worktree one.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `mode` (`worktree`\|`checkout`), default `worktree` |
| CLI command | update | `spec-env up` (in-place branch plan) |
| CLI command | update | `spec-env integrate` (rebase in place + ff) |
| CLI command | update | `spec-env down` (branch-only teardown) |
| CLI command | update | `spec-env live`, `connect` (named refusal) |
| Skill/rule | update | spec-go (run opener; checkout path), spec-complete, spec-to-main, spec-init |
| Docs | update | env.config.md, env.config.json.example, spec-planning.md |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Run the configured opener | ✅ | [01-auto-open.md](01-auto-open.md) |
| 2 | The `mode` config key | ✅ | [02-mode-key.md](02-mode-key.md) |
| 3 | `/spec-go` provisions in place | ✅ | [03-spec-go-checkout.md](03-spec-go-checkout.md) |
| 4 | Land, tear down, refuse | ✅ | [04-lifecycle.md](04-lifecycle.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-08 | Ready | backlog | Reuben Greaves |
| 2026-09-08 | In Progress | in-progress | Reuben Greaves |
| 2026-09-08 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-09-08 — Spec created after `8ffa6fc` made the per-spec hand-off explicit and recurring.
- 2026-09-08 — Phase 4 gained two tasks from live use of `/spec-live`. Its
  rebase failure is reported as "hit conflicts" whatever the cause, with git's
  own stderr discarded, and the planner checks the primary checkout's
  cleanliness while rebasing the worktree — so a dirty worktree is diagnosed as
  a merge conflict. Both sit in the code this phase already rewrites.
- 2026-09-08 — Phase 4 gained a third task after `/spec-live` failed outright
  in this repo with `Command "skitterspec" not found`. The commands hardcode
  that binary name; the published superset aliases it, but the dev-time provider
  package did not, so it resolved here only through a stale pnpm shim from an
  older install. Fixed for this repo in `009be5c`; the open question is whether
  the *contract* should require the alias or the commands should stop assuming
  it.
- 2026-09-08 — Phase 1: `env.config.md` already described `open.command` as a
  key that gets **run**, with an empty value meaning "nothing is opened". So
  this was not a behaviour change so much as the skill catching up with its own
  documented contract — the doc was right and `/spec-go` was the half that
  diverged. The doc gained only the timing (after bootstrap) and the
  non-interactive skip.
- 2026-09-08 — Phase 1: the provisioning bullet told the agent to *print* the
  opener, which would have contradicted the hand-off once it started running it.
  Reconciled to say the opener runs later, after the worktree is bootstrapped —
  a session must not open onto a tree with no dependencies installed.
- 2026-09-08 — Phase 2: **Decision 3's "refused by name" was wrong for this
  codebase and was overturned.** The env-config loader is lenient by design and
  `teardown.deleteRemoteBranch` already documents the better rule — an
  unrecognised value falls through to the default rather than erroring or being
  taken literally. Refusing would have broken every `spec-env` command over a
  single typo. `mode` follows that precedent; the safeguard is the fallback
  *direction*, always `worktree`, never `checkout`.
- 2026-09-08 — Phase 2: `init` already had a `mode` parameter meaning
  `init`|`update`, and `seedFiles` already had a `mode` meaning `symlink`|`copy`.
  The config key stays `mode` (unambiguous at the top level of the file), but the
  plumbing is `workspaceMode` so the two cannot be misread at a call site, and a
  test pins that setting one never moves the other.
- 2026-09-08 — Phase 2: the resolved mode is not surfaced in `spec-env up` yet —
  it would be a lie while provisioning still always makes a worktree. Added to
  Phase 3, where it starts being true.
- 2026-09-08 — Phase 3: checkout-mode provisioning is a pure planner
  (`planCheckoutUp`) like every other `spec-env` verb, so its refusals are
  testable without touching a repo. Verified end to end in a throwaway repo as
  well — create, re-attach, dirty refusal and other-branch refusal.
- 2026-09-08 — Phase 3: the live check is moot in checkout mode and the skill
  says so rather than leaving a check that can never fire. With no worktree
  there is nothing to take live — `mode: checkout` is the permanent form of what
  `/spec-live` does temporarily.
- 2026-09-08 — Phase 3: both plans now print a `mode:` line, closing the gap
  Phase 2 left open. It is the operator's only evidence of which mode resolved,
  since the loader falls back silently on a typo.
- 2026-09-08 — Phase 4: two ordering bugs found by running the lifecycle end to
  end rather than by unit tests. `integrate`'s live handling reads "primary is on
  the spec's branch" as a live session, which in checkout mode is simply where the
  branch lives — it refused to land a spec sitting exactly where it belongs, so the
  mode branch had to move above it. And `planIntegrateCheckout` asked "are you on
  the branch?" before "is it already landed?", which refused the very spec that had
  just landed — the state `/spec-complete` always calls integrate in.
- 2026-09-08 — Phase 4: the binary-name question is settled in favour of the
  contract requiring the alias, not the commands naming the install. The commands
  are shared assets composed into every distribution, so templating a binary name
  would add a seam for something with one right answer — and the published superset
  already aliases both. Stated in the provider contract, guarded by a test.
- 2026-09-08 — Phase 4: stating that contract initially named the provider in a
  *common* asset, and the base build's brand-leak guard caught it. Reworded to name
  no provider — the tracker-free base must not learn about one through its own docs.
- 2026-09-08 — Completed; all four phases done, 1385 tests green. The hand-off
  that prompted this spec is now optional: `mode: checkout` builds a spec on its
  branch in the checkout you are already in. `worktree` stays the default, so no
  installed repo changes behaviour on upgrade.
