---
linear_issue_id: "SKS-201"
---

# Phase 4 — Point the skills at the working line ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the four skills stop instructing the model to relay a dead link and a
command. After phase 1 the `remote` branch has nothing special left to say.

All four carry the same block today, ending:

> **`remote`** — say the link will not open where they are, then name the two
> that will: `skitterspec spec-env review serve --host 0.0.0.0`, or publishing.

- [ ] Replace that bullet in `packages/common/assets/skills/{spec-diff,spec-next,spec-bug,spec-hotfix}/SKILL.md`:
      a `remote` reader gets the `open:` line relayed, exactly like every other
      reader, because the engine has already made it openable.
- [ ] Keep **"never publish"** where it is, and keep it strong. Phase 1 changed
      what the engine does about serving and nothing about publishing.
- [ ] Keep **"never sniff for the reader"** verbatim. The assert-no-sniffing guard
      from `feat-diff-reaches-the-reader` phase 5 scans every shipped `SKILL.md`
      and permits a mention only on a line that also says not/never — edits here
      must not trip it.
- [ ] Recompose `packages/skitterspec-linear/assets/skills/` so the installed
      copies match, and confirm the dogfood symlinks resolve to the rewritten text.
- [ ] Rename the test that overclaims. `nothing is published or served on a
      detection` now describes a rule that no longer holds and never tested its
      second half. Split it: publishing stays prohibited and tested; serving is
      tested in phase 1 as behaviour that must happen.
- [ ] Update `packages/common/assets/core/env.config.md` for `serveOnRemote`, and
      the `/spec-diff` prose that tells a remote reader to start the server.

## Tests

- [ ] `assets-review.test.js` / `assets-phase-end-review.test.js` still pass —
      the offer keeps its shape, its position last, and its question.
- [ ] The assert-no-sniffing guard still passes over all four rewritten skills.
- [ ] No shipped `SKILL.md` tells the reader to run
      `spec-env review serve --host 0.0.0.0` as the answer to a remote reader.
- [ ] Composed assets under `packages/skitterspec-linear/assets/skills/` match
      their `packages/common` sources.
- [ ] Full suite green.
