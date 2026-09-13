---
linear_issue_id: "SKS-201"
---

# Phase 4 — Point the skills at the working line ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the four skills stop instructing the model to relay a dead link and a
command. After phase 1 the `remote` branch has nothing special left to say.

All four carry the same block today, ending:

> **`remote`** — say the link will not open where they are, then name the two
> that will: `skitterspec spec-env review serve --host 0.0.0.0`, or publishing.

- [x] Replace that bullet in `packages/common/assets/skills/{spec-diff,spec-next,spec-bug,spec-hotfix}/SKILL.md`:
      a `remote` reader gets the `open:` line relayed, exactly like every other
      reader, because the engine has already made it openable.
- [x] Keep **"never publish"** where it is, and keep it strong. Phase 1 changed
      what the engine does about serving and nothing about publishing.
- [x] Keep **"never sniff for the reader"** verbatim. The assert-no-sniffing guard
      from `feat-diff-reaches-the-reader` phase 5 scans every shipped `SKILL.md`
      and permits a mention only on a line that also says not/never — edits here
      must not trip it.
- [x] Recompose `packages/skitterspec-linear/assets/skills/` so the installed
      copies match, and confirm the dogfood symlinks resolve to the rewritten text.
- [x] Rename the test that overclaims. `nothing is published or served on a
      detection` now describes a rule that no longer holds and never tested its
      second half. Split it: publishing stays prohibited and tested; serving is
      tested in phase 1 as behaviour that must happen.
- [x] Update `packages/common/assets/core/env.config.md` for `serveOnRemote`, and
      the `/spec-diff` prose that tells a remote reader to start the server.

## Tests

- [x] `assets-review.test.js` / `assets-phase-end-review.test.js` still pass —
      the offer keeps its shape, its position last, and its question.
- [x] The assert-no-sniffing guard still passes over all four rewritten skills.
- [x] No shipped `SKILL.md` tells the reader to run
      `spec-env review serve --host 0.0.0.0` as the answer to a remote reader.
- [x] Composed assets under `packages/skitterspec-linear/assets/skills/` match
      their `packages/common` sources.
- [x] Full suite green.

## Outcome

Green — 2041 pass, 0 fail. All four skills rewritten in
`packages/common/assets/skills/`, recomposed into both distributions, and the
dogfood symlinks confirmed to resolve to the new text.

**The suite caught two things prose review would not have.**

- `assets-phase-end-review.test.js` asserted the literal string
  `**wording, never action**` in every rendering skill. That phrase *was* the
  decision this spec overturned, so the test had to be rewritten rather than
  kept passing — it now asserts the replacement rule (serving is authorised,
  publishing never is) and **fails if the old phrase comes back**. A new check
  reads the `remote` bullet specifically and refuses the serve command as the
  answer there, while leaving it legal elsewhere: it is still the right thing to
  name when describing the `serveOnRemote: false` opt-out.
- `assets-emphasis.test.js` rejected a `**bold**` span that crossed a hard line
  break in the `/spec-diff` rewrite — the rule in `.claude/rules/spec-planning.md`
  about round-tripping editors mangling split emphasis. Reworded, not suppressed.

The test that overclaimed is renamed rather than deleted:
`nothing is published on a detection, however remote the reader` now says what
it actually asserts, with a comment recording that its old name claimed a
serving prohibition it never tested — which is how the gap survived.
