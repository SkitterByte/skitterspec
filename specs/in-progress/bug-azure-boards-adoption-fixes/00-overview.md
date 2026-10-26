---
github_identifier: "#39"
github_url: "https://github.com/SkitterByte/skitterspec/issues/39"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Bug: five Azure Boards defects found adopting 1.0/1.1 in ereqs

> **Type:** Bug
> **Name:** bug-azure-boards-adoption-fixes
> **Status:** In Progress — fixed, tests green; awaiting review + commit
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-26
> **Area:** packages/azure-boards/src (cli-sync, api, dialect, config, identity), packages/azure-boards/assets

## Symptom

A handoff from ereqs' `feat-azure-boards-migration` (live repros against org
`fireflyonline`, project *LSC Requisitions*, Agile process), confirmed present
in `@skitterbyte/skitterspec-azure-boards@1.1.0`, plus one raised directly:

1. **Bare `spec-sync ref` crashes** — `git is not a function`, exit 1. The
   named-spec form works. `/commit` uses the bare form on every commit, and a
   crash read as "no ref" silently drops the `Refs:` trailer.
2. **Every spec containing `"` or `>` reads back as drift** — `apply`/`verify`
   warn `the tracker stored different text` on intact mirrors (128 warnings on
   a 33-spec bulk link), and the repo-wins drift check re-accuses on every
   push. AB#194 also reported `8 character(s) lost`, unexplained in the
   handoff.
3. **Assignment writes a GUID Azure refuses** — a derived `whoami` caches
   `connectionData.authenticatedUser.id`; `System.AssignedTo` rejects it
   (`unknown identity`), and the refusal fails the **whole** `apply`.
4. **Intake ignores work item type** — routing reads tags only, so in
   Agile/Scrum/CMMI (where a bug is a *type*) every untagged `Bug` item routes
   as a feature, and `/spec-bug` mints a `User Story`.
5. **`spec-env stage` doesn't recognise a spec's own `AB#…` snapshot** — the
   provider ships the right `branch.identifierField`/`spec.companionPaths`
   only into `env.config.json.example` at dist-compose time, so a project that
   adopted Azure Boards over an existing isolation config (ereqs: Linear-era
   values) classifies `specs/.core/azure-base/AB#n.base.json` as foreign, and
   `/commit`/`/spec-start` leave or refuse it.

## Root cause

1. `cli-sync.js:817` passes a directory path where `currentBranch` (common
   `env/resolve.js:452`) takes a **git runner**. The GitHub provider builds the
   runner (`packages/github/src/cli-sync.js:806`); this port missed it.
2. `api.js:158 descriptionText()` returns a markdown-format description
   **verbatim**, but Azure entity-encodes stray HTML specials on store
   (`>` → `&gt;`, `"` → `&quot;`); `decodeEntities()` runs only on the
   HTML-era branch. The "lost characters" are a second, undocumented Azure
   transform, confirmed by fetching AB#194 live: the sanitiser **strips
   tag-shaped tokens** (`<bucket>`, `<name>`) even inside backtick code spans
   — `specs/<bucket>/<name>/…` is stored as `specs//…`. 8-then (10 stripped −
   2 gained as `&gt;`), 12-now (a third token was added to the file after the
   push).
3. `identity.js` caches the viewer's GUID (`readViewer()` id slot), and
   `itemPatch` (`api.js:211`) writes it into `System.AssignedTo`, which only
   accepts the uniqueName/email. One refused field op fails the whole PATCH,
   taking the description and state with it.
4. `config.js:65` has tag lists only (`bugTags`/`hotfixTags`), and
   `azure.workItemType` is single-valued, so neither routing nor minting can
   see Agile's `Bug` type.
5. `ENV_CONFIG_DEFAULTS` (`config.js:114`) reaches only the **example** config
   (`build-dist.js` `mergeConfigDefaults`); the live engine's env defaults are
   the base's empties, and nothing warns when the snapshot it writes is not
   covered by the project's `spec.companionPaths`.

## Failing test (red)

12 tests across `packages/azure-boards/test/{cli-sync,api,dialect,config}.test.js`,
all under `the adoption handoff fixes` section markers. Run:
`node --test packages/azure-boards/test/*.test.js` → 112 pass, 12 fail, e.g.:

```
✖ a bare ref answers from the branch, and only on success
  TypeError: git is not a function
    at currentBranch (packages/common/src/env/resolve.js:453)
    at specSyncRef (packages/azure-boards/src/cli-sync.js:817)
```

## Phases

| Phase | File | Status |
|-------|------|--------|
| 1 — bare `ref` builds its git runner | [01-bare-ref-runner.md](01-bare-ref-runner.md) | ✅ |
| 2 — read-back decodes Azure's storage transform | [02-entity-roundtrip.md](02-entity-roundtrip.md) | ✅ |
| 3 — assignable identity, refusal skipped | [03-assignable-identity.md](03-assignable-identity.md) | ✅ |
| 4 — work item types in intake and minting | [04-intake-types.md](04-intake-types.md) | ✅ |
| 5 — stage claims the snapshot | [05-stage-owns-snapshot.md](05-stage-owns-snapshot.md) | ✅ |

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync ref` (bare form no longer crashes) |
| CLI command | update | `spec-sync apply` (assignee refusal skipped + reported; companion-coverage note) |
| CLI command | update | `spec-sync states` (asks `workItemTypeByKind` types too) |
| CLI command | update | `spec-sync whoami` / `users` (derive and print the assignable id) |
| Business rule | update | verify/drift compare decodes entities and ignores Azure's tag-strip |
| Config key | add | `intake.bugTypes` (default `["Bug"]`), `intake.hotfixTypes` (default `[]`) |
| Config key | add | `azure.workItemTypeByKind` (mint type per spec kind, fallback `azure.workItemType`) |
| Skill/rule | update | intake seam routes by type **or** tag; `/spec-azure-setup` asks; `azure-boards.config.md` documents |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-26 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-26 — Bugs reproduced; 12 failing tests added (red). AB#194's
  character loss explained by a live fetch: Azure strips tag-shaped tokens
  from stored markdown, code spans included.
- 2026-10-26 — Fixed: all five, red→green; full monorepo suite 4171 passed.
  Note on #2: the tag-token strip is Azure's and content genuinely leaves the
  mirror — the fix makes the compare treat it as the benign storage transform
  it is (the repo stays the truth), not a recovery of the stripped text.
- 2026-10-26 — #5 took a second mechanism beside the warn: provider
  `ENV_CONFIG_DEFAULTS` now reach the env engine at runtime (all four provider
  bins), beneath the project's env.config.json; an explicit `""`/`[]` still
  opts out, per the existing "two keys are one fix" contract.
- 2026-10-26 — Follow-up surfaced: the apply-side companion-coverage note
  exists only in this provider; github/jira/linear have the same silent gap
  when a project sets another provider's isolation keys. Not in scope here.
