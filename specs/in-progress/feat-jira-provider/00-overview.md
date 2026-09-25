---
linear_identifier: "SKS-370"
linear_url: "https://linear.app/skitterbyte/issue/SKS-370/skitterspec-jira-a-jira-cloud-ticketing-provider"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# skitterspec-jira — a Jira Cloud ticketing provider

> **Type:** Feature
> **Name:** feat-jira-provider (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-22)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
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
| 1 | De-Linearise sync-core & common | ✅ | [01-sync-core-neutrality.md](01-sync-core-neutrality.md) |
| 2 | Extract provider-kit, rewire linear | ✅ | [02-provider-kit.md](02-provider-kit.md) |
| 3 | Jira adapter core (client, ADF, transitions) | ✅ | [03-jira-adapter.md](03-jira-adapter.md) |
| 4 | Jira CLI, skills, seams | ✅ | [04-jira-cli-skills.md](04-jira-cli-skills.md) |
| 5 | Distribution + release wiring | ✅ | [05-distribution-release.md](05-distribution-release.md) |
| 6 | Docs, live smoke, first release | 🔄 | [06-docs-smoke.md](06-docs-smoke.md) |

## Open questions

- None — deferred capabilities are recorded in Decision 3 as follow-up specs.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-21 | Ready | backlog | Reuben Greaves |
| 2026-09-22 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-21 — Spec created from a full review of `packages/linear`,
  `sync-core`, and the build/release machinery.
- 2026-09-22 — Phase 1 built. Deviations: `readTicket` neutralised by pattern
  scan (any `<prefix>_identifier`) instead of `branch.identifierField`
  plumbing; `sanitise.js` moved to `packages/linear` with the dialect (was
  slated for phase 2); `LIFECYCLE_BUCKETS` deduped inside sync-core only,
  common keeps its private copy.
- 2026-09-22 — Phase 2 built. Deviations recorded in 02's notes: v1 credentials
  stay canonical until a second provider writes; apply orchestration and the
  credentials command layer deferred to phase 4 (second-consumer rule); merge
  helpers hoisted instead of a full loader factory. Release inputs for
  provider-kit wired now.
- 2026-09-22 — Phase 3 built. ADF stays inside the adapter (no remote hooks
  needed); nested-table flattening and the compare reduction hoisted to the kit
  as shared dialect pieces; jira's `skitterspec` bin alias moved to the phase-5
  distribution after a stale shim broke the workspace engine.
- 2026-09-22 — Phase 4 built. Apply orchestration landed in the kit with both
  providers consuming it (the phase-2 deferral resolved); jira ships no
  spec-claim/sanitise (deferred/not-applicable); seams complete at nine.
- 2026-09-22 — Phase 5 built. buildProvider parameterisation; three tag series
  wired end to end; the dev-link "unknown distribution" example was
  skitterspec-jira itself and moved.
- 2026-09-23 — Phase 6 repo half built (docs page, links, SETUP + smoke
  checklist). Live smoke and the 1.0.0 release are operator steps, the release
  necessarily post-landing.
- 2026-09-23 — Smoke finding, fixed: mdToAdf merged inherited strong/em onto
  `code` marks, and ADF's exclusion group makes Jira reject the whole document
  (verified against the live API: only `link` may accompany `code`). Inherited
  marks are now filtered to link-only at the code branch of inlineNodes —
  emphasis lost, words kept, per the module's word-level contract. Red→green
  with both test halves (packages/jira/test/adf.test.js). Diagnosis oracle
  worth keeping: a create POST with summary omitted always 400s and creates
  nothing, but still validates the description — a free ADF validator.
- 2026-09-23 — Follow-up surfaced: adfToText nests emphasis fences around a
  code span (`**x **`…`** z**` shapes) — word stream intact so the contract
  holds; cosmetic read-side twin of the exclusion blind spot. Not in scope.
- 2026-09-23 — Follow-up surfaced: `spec-env up <name> --docs` in a repo with
  an unborn HEAD (zero commits) crashes with a null "to" argument AFTER
  printing the plan, leaving an orphan worktree. Base-branch resolution needs
  a positive check; wants its own spec. Not in scope here.
- 2026-09-23 — Smoke finding, fixed: nothing in the flow ever drove the
  scaffolding/config to a commit — every lifecycle commit is bounded by
  pathspec (correctly), so `jira.config.json` stayed untracked and every spec
  worktree (forked from a commit) saw no config and reported sync off.
  init-config's write now says "commit it", SETUP.md warns, and doctor gained
  a `warn` row on an untracked config (positive signal: git tracks the file;
  no-git and other cannot-tells stay silent).
- 2026-09-23 — Smoke finding, documented: a deployment-pipeline workflow (On
  Test/On Live) makes finished phase subtasks read as deployed — status was
  carrying two state machines. Guidance added: jira.config.md "Choosing your
  status map" (work statuses, not pipeline stages; subtask workflows, fix
  versions, deployments panel as the standard outs) with a pointer from the
  states table row and SETUP.md step 3. The pipeline walk itself stays
  release.stages ladder territory, deferred from v1.
- 2026-09-25 — Smoke finding, fixed: /spec-sync reported ⚠️ for a branch-local
  bucket (an in-flight spec reading `backlog` from the primary checkout) — the
  normal case of worktree mode, misclassified because the skill's ⚠️ bullet
  invited it and its field list had no Notes row to carry the fact. Both
  providers' spec-sync skills now name the case ✅-with-Notes and gain the
  Notes field.
- 2026-09-25 — Follow-up surfaced: spec-sync plan/apply read the tree they run
  in, so a run from the primary checkout while the spec is in flight in a
  worktree pushes the stale base-branch view over the mirror (self-healing on
  the next worktree push, but silent). A one-line "reading: <tree> @ <branch>"
  or a warn when the spec has a provisioned worktree elsewhere would name it —
  both providers. Not in scope here.
- 2026-09-25 — Smoke finding, built: the bucket→status wiring was invisible
  between init-config runs, and Jira's third state axis (backlog/sprint
  membership vs status vs column) made a correct transition look wrong on the
  board. `spec-sync states` now renders the bucket map — per-row verdicts with
  status categories, closest match on a miss, one-line remap — and the
  adapter carries statusCategory through. Board/sprint membership stays
  deliberately untouched: sync mirrors spec state, never team ceremony.
