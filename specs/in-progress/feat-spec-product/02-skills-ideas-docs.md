---
github_issue_id: "#292"
---

# Phase 2 — Ask for it: /spec, /spec-idea, doctor, docs ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** people pick a product without editing config by hand. `/spec`
asks, ideas can be filed per product, `doctor` catches a missing area path, and
the docs say how to set it up.

## Tasks

- [x] Add `spec-sync products [--json]` (azure): the configured keys and area
      paths, plus the default.
- [x] In the Azure seam of `/spec`, ask for the product when more than one is
      configured, and write `> **Product:**`. With one product, use it without
      asking. With none, write nothing.
- [x] Add `spec-sync idea add --product <key>`, which files the idea in that
      area, and pass it through `/spec-idea` and `skitterspec idea`. Without the
      flag, ideas stay at the project root.
- [x] Make `spec-sync doctor` check that each configured area path exists in
      the project (Azure classification nodes). "Cannot tell", such as no
      credentials, warns and doesn't fail.
- [x] Document `azure.products` and the header in `docs/azure-boards.html` and
      the azure config template, and add `spec-sync products` to
      `docs/reference.html`. Stamp both with `docs-freshness verify`.
- [x] Show the spec's product on the review page, beside the title and
      ticket (requested mid-phase on 2026-11-24).
- [x] Tests: `products` output; `idea add --product` area and unknown key;
      doctor's missing-area and cannot-tell cases; a built-skill assertion for
      the `/spec` question. `pnpm build && pnpm test` green.
