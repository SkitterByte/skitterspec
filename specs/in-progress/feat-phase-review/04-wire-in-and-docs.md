---
linear_issue_id: "SKS-142"
---

# Phase 4 — wire it into the loop, and document it ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** finishing a phase ends with the page already written and the review
offered, and someone reading the docs can tell what is free, what costs, and what
publishing leaves behind.

## Tasks

- [ ] Update `/spec-next` so a finished phase runs `spec-env review` (engine
      only, no model tokens) and reports the path, then **offers** `/spec-diff`
      for the written review. Offer — never write the review unasked, and never
      publish.
- [ ] Keep the ordering honest: the page reflects the tree at the moment it was
      written, so generate it **after** the phase's tests are green and **before**
      the commit, which is the moment it is about.
- [ ] Document the loop in `docs/index.html`: build → look → review → commit,
      what costs tokens and what does not, that the page is gitignored, and that
      publishing is opt-in, one page per spec, and cannot be undone by the
      tooling.
- [ ] Say plainly in the docs that this replaces reaching for a tab: the page is
      read wherever you are, including on a phone, and no part of it depends on
      the shell's directory. Link the three cancelled specs' reasoning rather
      than repeating it.
- [ ] Run `scripts/docs-claims.test.js` — the new verb must be documented and no
      page may name a skill that does not ship. Expect it to fail until phases
      1–3 have landed; run it early rather than at the end.
- [ ] Run `pnpm test` at the repo root — the docs guards live there, not in a
      package — green before the phase is done.

- [ ] Delete the `review` entry from the `undocumented` allowlist in
      `scripts/docs-claims.test.js`. Phase 1 added it with a reason pointing
      here; documenting the verb on `docs/index.html` is what makes it stale, and
      leaving it behind would silence the guard for a verb that IS documented.

## Notes

`/spec-next` gaining a step is the part most likely to annoy someone who does not
want it. Keep the engine call silent on failure (report, never abort the phase),
and keep the offer to one line.
