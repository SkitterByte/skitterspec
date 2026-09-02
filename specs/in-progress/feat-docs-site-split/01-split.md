# Phase 1 — Carve out `linear.html` and cross-link the two ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a second self-contained page exists, the Linear-only content has moved
onto it, and each page points at the other — proven by both rendering standalone
with no shared asset.

## Tasks

- [ ] Create `docs/linear.html` from `index.html`'s shell: the same inline CSS,
      theme toggle, reduced-motion handling and inlined favicon, with its own
      `<title>`, `og:`/`twitter:` tags and `og:url`.
- [ ] Move the Linear-only sections across — the "Add Linear" opt-in section and
      the native-vs-custom comparison — leaving `index.html` a short pointer in
      their place rather than a hole.
- [ ] Keep the full command reference on `index.html` (decision 3); on
      `linear.html` reference it by link rather than duplicating the table.
- [ ] Cross-link: `index.html`'s nav gains a `linear.html` entry, and
      `linear.html` links back to the base page in its nav and its footer.
- [ ] Verify both pages standalone: open each with the other file absent and
      confirm no broken layout, no missing asset, no console error.
- [ ] Confirm neither page requests anything off-origin except the existing
      `og.png` absolute URL (scrapers need a real raster) — grep for `http` in
      `src`/`href` and check each hit is deliberate.

## Notes

`og.png` is shared deliberately: one social card for the project is correct, and
regenerating a second is work with no reader benefit. Only the `og:url` and the
title/description differ per page.

The comparison section moves rather than being copied — it argues *why the Linear layer is built the way it is*,
which is meaningless to a base reader.
