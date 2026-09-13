---
linear_issue_id: "SKS-205"
---

# Phase 3 — Report a drifted CLAUDE.md section ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a project whose installed `CLAUDE.md` section no longer matches the
shipped one can find that out, without being told its file is wrong.

## Tasks

- [ ] Add a function that compares the block between `<!-- skitterspec:start -->`
      and `<!-- skitterspec:end -->` in a project's `CLAUDE.md` against the
      shipped `claude-md-section.md`, returning one of three: `fresh`,
      `not installed`, `differs`.
- [ ] Add `skitterspec update --check`: report per managed area plus the
      `CLAUDE.md` section, **write nothing, exit 0**. It reports; `update`
      without the flag is still the only thing that changes a file.
- [ ] Word the `differs` case as a difference, never as staleness — the user's
      own edit and an out-of-date copy are indistinguishable from here, so it
      says what would change and that `skitterspec update` refreshes it.
      (`.claude/rules/negative-checks.md` rule 4.)
- [ ] Name the blind spot in a comment beside the check: markers absent means the
      section was never installed **or** was deliberately stripped
      (`stripClaudeMdSection` exists), and neither is a fault.
- [ ] Test all three states against scratch projects: a freshly installed project
      reports `fresh`; a project with the block hand-edited reports `differs`
      and is **not** called stale; a project with no `CLAUDE.md` at all, and one
      with a `CLAUDE.md` carrying no markers, both report `not installed` and
      exit 0.
- [ ] Pair it with the stays-silent case that matters most: a project whose
      `CLAUDE.md` is **fresh** must produce no drift line at all — an area that
      is fine should be silent, or the report trains people to ignore it.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

`installClaudeMd` already replaces the marked block on `mode: 'update'`, and
`resync` already calls it — so `skitterspec update` has always fixed this. Only
the reporting is new, which is why this phase adds no fixer and must not grow one.

This is the check that would have caught the incident: this repo's own
`CLAUDE.md` was five weeks behind the template it ships, through a whole spec
about that template, with every test green.
