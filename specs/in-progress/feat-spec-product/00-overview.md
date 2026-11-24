---
github_identifier: "#290"
github_url: "https://github.com/SkitterByte/skitterspec/issues/290"
---

# A spec's product, mirrored as its Azure area path

> **Type:** Feature
> **Name:** feat-spec-product
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/290
> **Author:** Reuben Greaves
> **Raised:** 2026-11-24
> **Area:** `packages/common/assets/rules/spec-format.md`, `packages/common/assets/skills/spec`, `packages/azure-boards/src/config.js`, `packages/azure-boards/src/cli-sync.js`, `packages/azure-boards/src/api.js`, `packages/azure-boards/assets`, `docs/azure-boards.html`
> **Stack:** worktree
> **Docs:** azure-boards, reference

## Summary

A spec can name the product it belongs to, for example `> **Product:** tendering`.
Azure Boards files the spec's work items in that product's area path, so one
DevOps project can hold several products and each product's stakeholders get
their own board.

## Problem

ereqs uses one Azure DevOps project, which is about to become a monorepo for
all new services. Tendering is the next one. The provider has a single
`azure.areaPath` for every spec, written only when an item is created, so
Tendering tickets would sit among ereqs tickets with no clean way to put each
product's work in front of its own stakeholders.

## Acceptance criteria

- With `azure.products` mapping `ereqs` and `tendering` to two area paths, a
  spec with `> **Product:** tendering` creates its work item and every phase
  item in the Tendering area.
- Changing a linked spec's `Product:` and pushing moves the item and its phase
  items to the new area.
- A spec with no `Product:` header uses `azure.areaPath`, exactly as today.
- A `Product:` value that isn't in `azure.products` refuses that spec's push
  and names the configured products. Nothing is written.
- `/spec-idea --product tendering` files the idea in the Tendering area.
  Without the flag the idea stays at the project root.
- `/spec` asks which product when the project configures more than one, and
  records the answer in the header.
- A project with no `azure.products` behaves exactly as it does today.

## Decisions

1. **The area path is the mechanism.** Team boards, backlogs, queries and
   permissions all scope by area, so each product's stakeholders get a board
   without a filter to remember. Rejected: tags, which need a hand-set filter
   on every board and don't drive team backlogs.
2. **A `Product:` header names a key, and the provider config maps keys to
   area paths** (`azure.products: { "tendering": { "areaPath": "LSC\\Tendering" } }`).
   Rejected: inferring the product from the folders in `Area:`, because shared
   code is ambiguous and backlog specs often name no files.
3. **The area is a mirrored field.** Every push writes it to the item and its
   phase items, so changing the header moves the item. The repo stays canonical.
   Rejected: writing it only at create, as today.
4. **The header is generic and only Azure maps it for now.** `spec-format.md`
   defines it for every provider. GitHub, Jira and Linear ignore it until
   someone needs a label, component or project for it.
5. **"Product", not "Project" or "Area".** "Project" already names the DevOps
   project and the skitterspec project, and "Area" already lists files.
6. **An unknown product refuses that spec's push**, naming the configured keys.
   A typo filed silently into the default area would be the very mixing this
   feature exists to stop. A header in a project with no `azure.products` is
   refused the same way.
7. **Phase items take their parent's area.** A phase always belongs to its
   spec's product.
8. **Ideas take an optional `--product`.** Without it they stay at the project
   root, as today.

## Solution overview

- `spec-format.md` documents `> **Product:** <key>`. It is optional and
  absent by default. The shared spec reader exposes it to the projection.
- The azure-boards config gains `azure.products` (key → `{ areaPath }`), and
  `azure.areaPath` stays the default. The projection carries the resolved
  area, so a header change appears in the plan as an update.
- `mintIssue`, `updateIssue`, `mintSubIssue` and `updateSubIssue` write the
  area. `spec-sync idea add --product <key>` resolves it the same way.
- `spec-sync products --json` lists the configured keys. `/spec` (through the
  Azure seam) asks for a product only when there is more than one, and
  `/spec-idea` passes `--product`.
- `spec-sync doctor` checks that each configured area path exists in the
  project.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Skill/rule | update | `spec-format.md`: `> **Product:**` header |
| Config key | add | `azure.products` (key → `{ areaPath }`) in `azure-boards.config.json` |
| Service | update | azure projection and apply: area written on create, update and phase items |
| CLI command | add | `spec-sync products [--json]` (azure) |
| CLI command | update | `spec-sync idea add --product <key>` (azure); `spec-sync doctor` checks area paths |
| Skill/rule | update | `/spec` asks for the product; `/spec-idea --product` (Azure seams) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Product header, products config, area written on every push | ✅ | [01-product-area.md](01-product-area.md) |
| 2 | Ask for it: /spec, /spec-idea, doctor, docs | ⬜ | [02-skills-ideas-docs.md](02-skills-ideas-docs.md) |

## Open questions

- None

## Changelog

- 2026-11-24 — Spec created. Requested from ereqs ahead of Tendering joining
  its DevOps project.
- 2026-11-24 — Phase 1 built. The area travels as a generic sync-core
  `placement`: a provider hook (`remote.placement`) resolves it, the snapshot
  records the last one sent (as `stateNames` does), and a plan that finds it
  changed updates the item and moves each phase item. A refused product is
  carried on the projection and raised only by `plan`/`apply`, so `status` and
  `list` over every spec still work. With products configured, a linked spec
  that has no recorded area is sent one, so configuring products moves
  existing items into their default area.
