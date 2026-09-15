---
linear_issue_id: "SKS-252"
---

# Phase 4 — Approve helper; CI becomes the only publisher ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a staged release can be approved by one command, and there is no
remaining way to publish from a laptop.

## Tasks

- [ ] Add `scripts/approve-release.cjs` and wire `npm run approve` — takes a
      package and version, resolves them to a **stage-id** via
      `npm stage list <spec> --json`, then calls `npm stage approve <uuid>`.
- [ ] Parse that JSON **defensively**: npm's docs do not pin down the field
      names, so probe for the id rather than assuming a key, and fail with the
      raw payload when nothing matches. `approve|reject|view|download` take a
      UUID and reject a package spec with `stage-id must be a valid UUID`.
- [ ] Treat an `E401` from `npm stage list` as "not logged in", not "no such
      release" — say so, and name `npm login` and the >= 11.15.0 local floor.
      A missing version means unknown, never failed
      (`.claude/rules/negative-checks.md`).
- [ ] Remove `--publish` from `scripts/release.js`: drop the publish-phase step,
      the flag, its help text, and update the tests that assert on the plan's
      phases. `--yes` (bump, commit, tag) is unchanged.
- [ ] Update `RELEASING.md` with the new flow end to end, including the npm website's
      trusted-publisher field values and the approve step.
- [ ] Update `CLAUDE.md`'s release paragraph so it no longer implies a local
      publish.
- [ ] Add tests: the approve helper resolves a version to a stage-id from a
      representative payload; a payload with no match refuses rather than
      guessing; `release.js`'s plan contains no publish step at any level.
- [ ] Run the project's test command — green before the phase is done.

## Notes

`npm stage list` is the only stage subcommand that accepts a package spec, and
the only one supporting `--json` — which is why the helper must list before it
approves.

Removing `--publish` is what makes provenance a property of every release rather
than of the ones that happened to go through CI.
