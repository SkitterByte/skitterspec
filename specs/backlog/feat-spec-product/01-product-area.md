---
github_issue_id: "#291"
---

# Phase 1 — Product header, products config, area written on every push ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a spec's `Product:` decides its Azure area path on create and on
every later push, phase items included. This is proven against the Azure
adapter's test fakes.

## Tasks

- [ ] Document `> **Product:** <key>` in `packages/common/assets/rules/spec-format.md`.
      It is optional, defined for every provider, and mapped per provider.
- [ ] Read the header in the shared spec reader so the projection can see it.
- [ ] Add `azure.products` (key → `{ areaPath }`) to
      `packages/azure-boards/src/config.js`, with validation that rejects
      malformed entries and keeps `azure.areaPath` as the default.
- [ ] Resolve the area in the azure projection: header key → its area path,
      no header → `azure.areaPath`. An unknown key, or a header with no
      `azure.products`, refuses that spec's plan and names the configured keys.
- [ ] Write the area in `mintIssue`, `updateIssue`, `mintSubIssue` and
      `updateSubIssue` (`cli-sync.js`), with phase items taking the parent's
      area, so a header change plans an update that moves the items.
- [ ] Tests:
      - create in the product's area;
      - a header change moves the item and its phase items;
      - no header uses the default;
      - an unknown key refuses and writes nothing;
      - stays-silent: no `azure.products` and no header produce exactly
        today's plan and writes.
- [ ] `pnpm test` green.
