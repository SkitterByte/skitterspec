---
linear_identifier: "SKS-408"
linear_url: "https://linear.app/skitterbyte/issue/SKS-408/skitterspec-github-a-github-issues-projects-ticketing-provider"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# skitterspec-github — a GitHub Issues + Projects ticketing provider

> **Type:** Feature
> **Name:** feat-github-provider (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-10-22)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-22
> **Area:** packages/provider-kit (released.js ref pattern, assignment +
> release seams), new packages/github, new packages/skitterspec-github,
> packages/common (init.js engine bins/protected lists, hooks),
> scripts/{build-dist,release,release-notes,dev-*}.js,
> .github/workflows/release.yml, scripts/approve-release.cjs, docs/,
> specs/.core (linear.config.json → github.config.json),
> specs/backlog/feat-tracker-releases
> **Stack:** worktree

## Problem

Linear costs $18/month, and every repo it serves except one — skitterspec,
skittership, skitterload — already lives on GitHub, where issues, sub-issues,
assignees, boards and releases are free. GitHub's one apparent gap, issues being
only open/closed, is closed by a **Projects v2 board**: a Status single-select
with whatever options we define, shown in the issue sidebar, free on a personal
account. A board can also carry a second single-select — `Deployed` — so the
release stage lives beside the work state instead of inside it, avoiding the
two-state-machines trap the Jira smoke test hit. With the provider-kit already
proven by two providers, a third costs an adapter, not an architecture.

## Decisions

1. **GitHub Issues + Projects v2, on the personal `SkitterByte` account.** No org
   move, no paid plan. Issue types and issue fields (org-only) are an optional
   config path, used only when the owner is an org; a personal owner tells spec
   from phase by **label** (`spec`, `phase`, configurable). Rejected after
   comparison: GitNative (MCP-only, no engine API, per-write confirmations),
   Basecamp ($15/user, no releases, OAuth-only), Trello (no real hierarchy, no
   releases), staying on Linear (cost).
2. **The board is required, one per repo.** Setup refuses until
   `github.config.json` names a board and its Status field. Every spec and phase
   issue is added to the board when minted (an issue off the board has no
   status). Rejected: an optional board with a label fallback — two status code
   paths for a setup step done once.
3. **Bucket → Status option via config, plus the issue's own state.** `states`
   maps bucket → Status option name (`backlog`→Backlog, `in-progress`→In
   Progress, `complete`→Done, `cancelled`→Cancelled). Terminal buckets also close
   the issue with `state_reason` `completed` / `not_planned`, so the issue list
   agrees with the board. Option and field ids are resolved by name at run time;
   an unknown name is a named refusal (positive signal: options listed, target
   absent), as Jira's transitions are.
4. **Transport: REST + GraphQL primary, GitHub's official MCP server fallback.**
   Issues and sub-issues over REST; board items and field values over GraphQL
   (`addProjectV2ItemById`, `updateProjectV2ItemFieldValue`). Same dual-transport
   discipline as the other providers (impossible ops exit 1; the rest hand the
   skill instructions).
5. **Credentials: a classic PAT with `repo` + `project`** — fine-grained tokens
   are documented only for org-owned boards. `GITHUB_TOKEN`/`GH_TOKEN` env wins,
   then the kit's v2 store namespaced `github`. Doctor names the scope that is
   missing (positive signal: the `X-OAuth-Scopes` header). Never via chat.
6. **Per-provider frontmatter: `github_identifier` (`#123`), `github_url`,
   `github_issue_id`** (a phase's `#N`, as `jira_issue_id` holds a key). Node
   and database ids are resolved at run time, never stamped. Linear stamps are
   untouched.
7. **Trailer `Refs: #123`.** Inert — not a GitHub closing keyword
   (close/fix/resolve and their forms stay banned). The kit's hardcoded
   `IDENTIFIER_RE` (`released.js:19`) becomes provider-supplied so `released`
   scans `#N`, and still counts `SKS-N` as known-foreign history rather than
   unreferenced.
8. **Description dialect is GitHub-flavoured markdown**, near-identity: the
   projection's markdown goes in as-is, task checkboxes render natively. A box
   ticked on GitHub is drift that the next push replaces **loudly** — the
   existing one-way rule, unchanged. Body cap 65,536 chars is a named refusal.
9. **v1 scope: the Jira-v1 core + assignment + intake + releases.** Core = link,
   plan/apply/stamp/record/verify, status, list, linked, ref, released,
   preserve, doctor, credentials, init-config, states, setup skill, all seams.
   Assignment maps to issue assignees (`/spec-claim`, `whoami`, `users`) and
   hoists linear's assignment logic into the kit (second consumer). Intake
   adopts an existing issue, routes on `bugLabels`/`hotfixLabels`, preserves
   the original body as a comment. Deferred: retarget, reattach, sanitise.
10. **Releases: this spec builds the provider-neutral release seam**, reusing
    `feat-tracker-releases` Decisions 1–7 (skitterspec decides contents; CI
    creates on tag push; `release create|deployed|complete`, dry-run unless
    `--apply`; idempotent by lookup; range = previous tag in series; env keys
    in config). GitHub implementation: `create` makes/updates the GitHub
    Release for the tag with the ticket list + notes and comments once on each
    attached issue; `deployed <version> <env>` sets the board's `Deployed`
    field on each attached issue; `complete` clears the Release's prerelease
    flag. `feat-tracker-releases` is cut down to "Linear adapter for the seam".
11. **Migration: open specs only.** Backlog and in-progress specs are linked to
    GitHub by an ordinary push once `github.config.json` exists (unlinked for
    GitHub → create). Complete and cancelled specs keep their `linear_*`
    stamps as history. No bulk minting.
12. **This repo swaps its dogfood to GitHub** in the last phase;
    `skitterspec-linear` stays built, tested and released, with ereqs (Azure
    DevOps-hosted) as its live user. Cancelling Linear waits on ereqs — see
    the Azure Boards follow-up in the Changelog.
13. **Binary contract honoured.** `@skitterbyte/skitterspec-github` ships
    `skitterspec-github` aliased as `skitterspec`; install exactly one of the
    four distributions.

## Solution overview

Same layout the Jira spec established:

```
packages/
  provider-kit/        + provider-supplied ref pattern, assignment ops,
                         release seam (verbs + optional adapter ops)
  github/          NEW   REST/GraphQL client, board resolution, GFM dialect,
                         MCP matchers, skills, seams
  skitterspec-github/  NEW published superset
```

```jsonc
// specs/.core/github.config.json
{
  "github": { "owner": "SkitterByte", "repo": "skitterspec",
              "project": 7, "statusField": "Status",
              "labels": { "spec": "spec", "phase": "phase" } },
  "states": { "backlog": "Backlog", "in-progress": "In Progress",
              "complete": "Done", "cancelled": "Cancelled" },
  "intake": { "label": "", "bugLabels": ["bug"], "hotfixLabels": [] },
  "auth":   { "tokenEnv": "GITHUB_TOKEN" },
  "releases": { "deployedField": "Deployed",
                "series": [{ "tagPrefix": "skitterspec@",
                             "envs": { "staged": "Staged", "published": "Published" } }] }
}
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Package | add | `packages/github` (private), `@skitterbyte/skitterspec-github` (published) |
| CLI command | add | `skitterspec-github spec-sync <core + assign/users/whoami>` + `skitterspec` alias |
| CLI command | add | `spec-sync release create\|deployed\|complete` (neutral seam; GitHub impl) |
| Config key | add | `specs/.core/github.config.json` (+ example + reference doc) |
| Domain object | update | provider-kit: ref pattern from provider; assignment + release seams |
| Schema/model | update | credentials store gains the `github` namespace |
| Skill/rule | add | github skills (push, status, sync, list, claim, setup) + 9 seam fragments, `commit-trailers.md` (`Refs: #N`) |
| Service | update | common: `ENGINE_BINS`, `PROTECTED_*`, hook engine loops |
| CLI command | update | build-dist, release, release-notes, dev-link/sync/unlink |
| Business rule | update | release workflow gains the fourth tag series and calls `release create` |
| Config | update | this repo: `linear.config.json` → `github.config.json`; `approve-release.cjs` completes the release |
| Spec | update | `feat-tracker-releases` re-scoped to the Linear adapter |
| Route/UI | add | `docs/github.html`, docs index links, dist README |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Spike GitHub APIs + kit neutrality (ref pattern) | ✅ | [01-spike-and-ref-pattern.md](01-spike-and-ref-pattern.md) |
| 2 | GitHub adapter core (REST, GraphQL board, dialect) | ✅ | [02-github-adapter.md](02-github-adapter.md) |
| 3 | CLI, MCP, skills, seams, intake | ✅ | [03-cli-skills-seams.md](03-cli-skills-seams.md) |
| 4 | Assignment hoisted to the kit + `/spec-claim` | ✅ | [04-assignment.md](04-assignment.md) |
| 5 | Release seam + GitHub releases | ⬜ | [05-release-seam.md](05-release-seam.md) |
| 6 | Distribution + release wiring | ⬜ | [06-distribution-release.md](06-distribution-release.md) |
| 7 | Docs, live smoke, dogfood swap, first release | ⬜ | [07-docs-smoke-dogfood.md](07-docs-smoke-dogfood.md) |

## Open questions

- None — phase 1's spike confirms the token and API assumptions, and its notes
  record anything that moves a decision.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-22 | Ready | backlog | Reuben Greaves |
| 2026-10-22 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-22 — Spec created after comparing GitHub, GitNative, Basecamp, Trello
  and Azure Boards against what the Linear/Jira providers use.
- 2026-10-22 — Follow-up surfaced: `feat-azure-boards-provider` for ereqs
  (Azure DevOps-hosted; Boards ships free with the client's Azure DevOps and
  has an official remote MCP server). It is what lets Linear be cancelled
  outright. Not in scope here; spec it when the client decides on Boards.
- 2026-10-22 — Phase 1 built (code half). The three live-spike tasks moved to
  phase 7's live smoke: they need operator-held GitHub setup, and the adapter
  can be built against mocks meanwhile. MCP has no release write tool, so
  `release create` over MCP refuses (phase 5).
- 2026-10-22 — Phase 2 built. Decision 6 corrected: `github_issue_id` stamps
  the phase's `#N` (the sync-core vocabulary stamps identifiers there), not a
  node id. Kit retry gained an `isLimited` hook and `X-RateLimit-Reset`
  support, defaults unchanged for the other providers.
- 2026-10-22 — Phase 3 built. Intake became an engine command
  (`spec-sync intake`) rather than an MCP-only seam step; `list` reads the board.
- 2026-10-22 — Follow-up surfaced: `skitterspec-jira spec-sync ref` with no
  argument crashes ("git is not a function" — `currentBranch(dir)` in
  packages/jira/src/cli-sync.js:606 is passed a path, not a git reader), so the
  commit-trailers rule's default form is broken for Jira users. Its tests only
  cover the named form. Not in scope here; wants a `/spec-bug`.
- 2026-10-22 — Phase 4 built. Assignment commands hoisted to the kit with an
  optional `validateAssignee` hook; GitHub refuses a non-collaborator before
  the stamp rather than at push.
