---
linear_identifier: "SKS-370"
linear_url: "https://linear.app/skitterbyte/issue/SKS-370/skitterspec-jira-a-jira-cloud-ticketing-provider"
---

# skitterspec-jira — a Jira Cloud ticketing provider

> **Type:** Feature
> **Name:** feat-jira-provider (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Ready — not started
> **Author:** Reuben Greaves
> **Developer:** —
> **Raised:** 2026-09-21
> **Area:** packages/sync-core, packages/common (src/env/resolve.js, src/init.js,
> src/cli.js, assets/hooks), packages/linear (rewired, no behaviour change),
> new packages/provider-kit, new packages/jira, new packages/skitterspec-jira,
> scripts/build-dist.js, scripts/release.js, scripts/release-notes.js,
> scripts/dev-*.js, .github/workflows/release.yml, docs/
> **Stack:** worktree

## Problem

skitterspec's ticketing sync ships as one provider, Linear. The architecture
was split for exactly this moment (`feat-monorepo-ticketing-extraction`:
"Linear now, Jira likely next"): `common` is tracker-free, `sync-core` is the
neutral projection/plan engine, and seams compose a provider into the shared
skills at build time. But the second provider was never built, so ~1,600 lines
of genuinely generic plumbing live inside `packages/linear/src/cli-sync.js`,
and four real Linear-isms leaked into the neutral layers: the `linear_*`
frontmatter vocabulary is read inside sync-core and `common/src/env/resolve.js`,
the markdown canonicalisation encodes Linear's reserialisation quirks, the
remote-issue shape is assumed, and the credentials store has no provider
dimension. A Jira provider forces those debts to be paid — and proves the
provider contract is real rather than a one-off.

## Decisions

1. **Jira Cloud only.** REST v3, `email:api-token` basic auth, ADF
   descriptions. Data Center (PATs, wiki markup) is a possible later variant,
   not v1 — supporting both roughly doubles the adapter and test matrix.
2. **One phased spec, hoist-first.** Phases 1–2 de-Linearise sync-core/common
   and extract a provider-kit, each shippable as a refactor-only
   `skitterspec-linear` release proving zero regression; phases 3–6 build Jira
   on top. Rejected: copy-paste `packages/linear` → doubles maintenance forever.
3. **Core scope with deferrals.** v1 ships link/plan/apply/stamp/record/verify,
   status, list, linked, ref, released, preserve, doctor, credentials,
   init-config, states, the setup skill, and all 8 seams. Deferred to follow-up
   specs: assignment/`/spec-claim`, the release-stage ladder, retarget,
   reattach, a sanitise analogue, and epic parenting.
4. **New private `packages/provider-kit`, not a fatter sync-core.** sync-core
   stays the pure projection/plan/snapshot engine with no CLI, no network, no
   fs-walking; the kit owns the CLI-side plumbing both providers share.
5. **Per-provider frontmatter keys, vocabulary parameterised.** Jira stamps
   `jira_identifier` / `jira_url` / `jira_issue_id`. sync-core stops hardcoding
   `linear_*` (`normalize.js:391,723`, `write.js:152`, `retarget.js:44,257`,
   `legacy.js:31`) and takes the field names from the provider's config.
   Existing repos' `linear_*` stamps are untouched — no migration. Rejected:
   neutral `tracker_*` keys, which would force a spec-file migration for zero
   user benefit.
6. **Credentials store schema v2 with a provider namespace.** Today's
   `credentials.json` is a flat `{teams: {<id>: …}}` map a second provider
   would collide with. v2 namespaces by provider; v1 entries are read
   transparently as Linear's (`.claude/rules/negative-checks.md` rule 4 — an
   unrecognised shape is kept, never destroyed). Jira entries hold the
   email + API-token pair, not a single key.
7. **The description dialect is provider-owned.** Linear's mangle
   canonicalisation (`normalize.js:91-223`, `tables.js`, `verify.js:24-56`)
   moves behind a `dialect` hook sync-core takes from the provider; Jira's
   dialect is a markdown→ADF renderer for writes and an ADF→canonical-text
   stream for snapshot hashing and verify read-back. Written in-repo — the
   published packages keep `prompts` as their only runtime dependency.
8. **Status moves are transition-resolved, never direct writes.** Jira has no
   "set state": the adapter fetches the issue's available transitions and
   applies the one landing on the target status. No matching transition is a
   loud, named refusal — a positive signal (transitions listed, target absent),
   never a guess.
9. **Dual transport preserved.** REST API primary; Atlassian's official remote
   MCP server as the keyless fallback, with the same per-command degradation
   discipline as Linear (impossible ops exit 1 and say so; the rest exit 0 and
   hand the skill instructions plus the file-handoff idiom).
10. **The `spec-project-picker` seam gets a no-picker fill.** Linear's project
    ≈ a grouping below the team; Jira issues land in the configured project by
    construction. The seam is filled with one line saying so; epic parenting is
    the deferred analogue.
11. **Binary contract honoured.** The dist ships `skitterspec-jira` and aliases
    `skitterspec` to the same entry point; install exactly one of the three
    distributions, as today's OR rule already states.

## Solution overview

Target layout (new packages marked):

```
packages/
  common/            unchanged role; resolve.js honours branch.identifierField,
                     init/hooks learn the third engine bin
  sync-core/         projection engine, now vocabulary- and dialect-parameterised
  provider-kit/  NEW private — shared CLI plumbing: config-merge factory,
                     namespaced credentials store, identity, doctor framework,
                     released/trailer scanning, transport resolution, arg
                     parser, spec resolution, plan→apply→stamp→verify→record
                     orchestration, HTTP retry/backoff
  linear/            rewired onto the kit; behaviour identical
  jira/          NEW private @skitterbyte/skitterspec-provider-jira — REST v3
                     client, ADF dialect, transition mapping, jira.config.*,
                     skills, seam fragments
  skitterspec/           published base (unchanged)
  skitterspec-linear/    published superset (refactor-only releases from ph 1–2)
  skitterspec-jira/  NEW published superset — composed like linear's dist
```

The Jira mapping mirrors Linear's: spec folder → issue (configured issue type),
phase → sub-task, tasks → checklist in the description (ADF), lifecycle bucket →
workflow status via the config's `states` map, resolved to a transition at
apply time. One-way sync semantics, snapshots, drift reporting, preserve-before-
adopt, and the `Refs:` trailer rule all carry over unchanged — they live in
sync-core, the kit, and the seams, which is the point of the hoist.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Package | add | `packages/provider-kit`, `packages/jira` (both private), `@skitterbyte/skitterspec-jira` (published) |
| CLI command | add | `skitterspec-jira spec-sync <core subcommands>` + `skitterspec` alias |
| Config key | add | `specs/.core/jira.config.json` (+ example + reference doc) |
| Schema/model | update | credentials store v1 → v2 (provider namespace, transparent v1 read) |
| Domain object | update | sync-core takes frontmatter `fields` + `dialect` from provider config |
| Skill/rule | add | jira skills (push, status, sync, list, setup) + 8 seam fragments |
| Service | update | common: resolve.js identifier field, init engine-bin + protected lists, hook engine loops |
| CLI command | update | build-dist.js, release.js, release-notes.js, dev-link/sync/unlink |
| Business rule | update | release workflow gains the third tag series |
| Route/UI | add | `docs/jira.html`, docs index links, dist README |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | De-Linearise sync-core & common | ⬜ | [01-sync-core-neutrality.md](01-sync-core-neutrality.md) |
| 2 | Extract provider-kit, rewire linear | ⬜ | [02-provider-kit.md](02-provider-kit.md) |
| 3 | Jira adapter core (client, ADF, transitions) | ⬜ | [03-jira-adapter.md](03-jira-adapter.md) |
| 4 | Jira CLI, skills, seams | ⬜ | [04-jira-cli-skills.md](04-jira-cli-skills.md) |
| 5 | Distribution + release wiring | ⬜ | [05-distribution-release.md](05-distribution-release.md) |
| 6 | Docs, live smoke, first release | ⬜ | [06-docs-smoke.md](06-docs-smoke.md) |

## Open questions

- None — deferred capabilities are recorded in Decision 3 as follow-up specs.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | Ready | backlog | Reuben Greaves |

## Changelog

- 2026-09-21 — Spec created from a full review of `packages/linear`,
  `sync-core`, and the build/release machinery.
