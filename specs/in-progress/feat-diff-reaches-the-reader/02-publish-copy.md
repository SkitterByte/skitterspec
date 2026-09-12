---
linear_issue_id: "SKS-187"
---

# Phase 2 — `--publish-copy`, so publishing needs no hand transform ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine emits the body-only copy an artifact host can accept, so
publishing stops being a manual document-splitting job.

## Tasks

- [x] Add `--publish-copy` to `spec-env review`. It writes
      `<page>.publish.html` beside the page: the `<title>`, the `<style>` and
      `<script>` blocks carried out of `<head>`, then the `<body>` contents —
      with no `<!doctype>`, `<html>`, `<head>` or `<body>` wrapper.
- [x] Split with the template's own structure rather than a regex over the whole
      rendered file. The page reviews its own source, so a rendered diff
      legitimately **contains** `<!doctype html>`, `<html>` and `<body>` as
      string data inside the JSON island — a naive match finds those.
- [x] Print the fragment's path on its own labelled line (`publish:`), and report
      it in `--json`, so the skill never builds the path itself.
- [x] Do not write the fragment on an ordinary render. One flag, one extra file,
      only when publishing is actually happening.
- [x] Tests (extend `packages/common/test/assets-review.test.js` or a new
      `env-review-publish-copy.test.js` — whichever matches where the template
      guards live): the fragment starts with `<title>`, carries every `<style>`
      block, and has **no wrapper tag outside a `<script>`**; asserted by
      position, so a `<body>` inside the data island does not fail it.
- [x] **Stays-silent tests:** a render without the flag writes no `.publish.html`;
      the full page is byte-identical whether or not the flag was passed.
- [x] Run the project's test command — green before the phase is done.

## Notes

The wrapper-inside-the-island case is not hypothetical: it is what the first
hand publish of `feat-review-offer-lands` hit, where four wrapper-looking tags
in the fragment were all patch content from `page.html` itself. The test has to
distinguish position, not presence.

## Outcome

Nine tests, all green (`packages/common/test/env-review-publish-copy.test.js`);
full suite **1953 pass, 0 fail**.

**The split runs on the template, never the rendered page**, and this repo
proves why. `--publish-copy` on this very phase produced a fragment containing
**22 wrapper-looking tags** — `<!doctype`, `<html>`, `<head>`, `<body>` — every
one of them inside the data island as patch text, because the diff includes the
code that names those tags as string literals. Loose ones: zero. A regex over
the rendered page would have cut at the first of those 22.

The template is unambiguous by construction — one `<head>`, one `</head>`, one
`<body>`, one `</body>`, and placeholders where content goes — so it is split
with indices rather than a pattern, and a template it cannot split throws rather
than emitting a half-cut fragment.

**Tests assert by position, not presence.** `wrapperTags()` pairs every
wrapper-looking tag with whether it sits inside a `<script>`; the assertion is
that the *loose* list is empty. A presence check would pass on a fragment cut in
the wrong place and fail on a correct one — the opposite of useful. One test
feeds a patch that is itself a whole HTML document, which is the case that
actually broke by hand.

A new file rather than `assets-review.test.js`: the fragment needs both the
template guards and a CLI-level check, and that file has no CLI harness.
