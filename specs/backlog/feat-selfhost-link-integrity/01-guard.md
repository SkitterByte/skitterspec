---
linear_issue_id: "SKS-131"
---

# Phase 1 — Catch a copy where a link belongs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a shipped skill or rule installed as a real file, where this repo's
convention is a symlink, fails the suite naming the path and the fix.

## Tasks

- [ ] Extend `scripts/claude-links.test.js`: for every skill the distribution
      ships (`packages/*/assets/skills/*/SKILL.md`) that is present under
      `.claude/skills/`, assert the installed entry is a **symlink**. Do the same
      for `.claude/rules/`.
- [ ] Derive the expected set from the shipped assets, not from a hardcoded list
      — decision 2. A new skill must be covered the moment it ships, which is the
      whole failure being fixed.
- [ ] Exempt `.claude/commands/` **by reason, not by omission**: link one and its
      `{{exec}}` placeholder never gets filled. The existing
      `commands are installed copies, never links` test states this; reference it
      rather than restating the reason.
- [ ] Make the failure message name the path **and** the fix — the relink script
      from phase 2 (or the `ln -s` until it exists). A guard that only reports a
      mismatch leaves the reader to work out what shape was wanted.
- [ ] Assert the reader found something: if the shipped-skill scan comes back
      empty the test must fail, not pass. An empty expected-set is how this class
      of check silently stops working.
- [ ] Add the **stays-silent** cases (`.claude/rules/negative-checks.md` rule 3):
      a correctly-linked skill does not fire; a command (a legitimate copy) does
      not fire; a skill present in the assets but **not installed** does not fire
      — not every shipped skill is installed in every consumer, and accusing an
      absence is the mistake that rule exists to prevent.
- [ ] Prove it fires: replace one link with a copy of its target, confirm the
      suite goes red naming that skill, then restore the link.
- [ ] Run `pnpm test` at the repo root — green before the phase is done. (This
      repo has no separate typecheck step.)

## Notes

The two skills that prompted this — `spec-list` and `spec-claim` — were relinked
by hand before the spec was written, so the tree is already healthy. Phase 1 is
therefore written against a healthy tree and must be proven by deliberately
breaking one link, not by watching it fail on the original fault.
