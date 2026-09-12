---
linear_issue_id: "SKS-187"
---

# Phase 2 — `--publish-copy`, so publishing needs no hand transform ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine emits the body-only copy an artifact host can accept, so
publishing stops being a manual document-splitting job.

## Tasks

- [ ] Add `--publish-copy` to `spec-env review`. It writes
      `<page>.publish.html` beside the page: the `<title>`, the `<style>` and
      `<script>` blocks carried out of `<head>`, then the `<body>` contents —
      with no `<!doctype>`, `<html>`, `<head>` or `<body>` wrapper.
- [ ] Split with the template's own structure rather than a regex over the whole
      rendered file. The page reviews its own source, so a rendered diff
      legitimately **contains** `<!doctype html>`, `<html>` and `<body>` as
      string data inside the JSON island — a naive match finds those.
- [ ] Print the fragment's path on its own labelled line (`publish:`), and report
      it in `--json`, so the skill never builds the path itself.
- [ ] Do not write the fragment on an ordinary render. One flag, one extra file,
      only when publishing is actually happening.
- [ ] Tests (extend `packages/common/test/assets-review.test.js` or a new
      `env-review-publish-copy.test.js` — whichever matches where the template
      guards live): the fragment starts with `<title>`, carries every `<style>`
      block, and has **no wrapper tag outside a `<script>`**; asserted by
      position, so a `<body>` inside the data island does not fail it.
- [ ] **Stays-silent tests:** a render without the flag writes no `.publish.html`;
      the full page is byte-identical whether or not the flag was passed.
- [ ] Run the project's test command — green before the phase is done.

## Notes

The wrapper-inside-the-island case is not hypothetical: it is what the first
hand publish of `feat-review-offer-lands` hit, where four wrapper-looking tags
in the fragment were all patch content from `page.html` itself. The test has to
distinguish position, not presence.
