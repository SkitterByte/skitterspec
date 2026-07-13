# Phase 4 — Dogfood: consume skittership + refresh docs ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** The skitterspec repo itself generates its CHANGELOG/RELEASES and uses
`/commit` via skittership (not self-hosted copies), and all docs describe the two
packages accurately — with the release generation verified end-to-end.

## Tasks

- [ ] Resolve the open question (dependency mechanism): depend on skittership from
      this repo via a dev dependency (`@skitterbyte/skittership` once published, or
      a git/`file:` dep pre-publish) or `npx @skitterbyte/skittership`.
- [ ] Re-source this repo's release generation from skittership: update the
      `package.json` `version`/`changelog`/`releases` scripts to call skittership's
      generators, remove the self-hosted `scripts/generate-*.js` +
      `scripts/lib/*` copies, and rename `skitterspec.config.json` →
      `skittership.config.json` (via `skittership init`'s migration).
- [ ] Re-adopt the `/commit` skill + `commit-messages.md` rule in this repo from
      skittership so `.claude/` and `CLAUDE.md` still reference them.
- [ ] Verify end-to-end: a dry `npm version`-style run regenerates
      `CHANGELOG.md` + `RELEASES.md` correctly from commits, and `/commit` works.
- [ ] Update docs: `README` (split skitterspec vs skittership, install/adopt
      each), the spec-planning rule paragraphs that mention release tooling, and
      `assets/claude-md-section.md`. Add a short skittership README covering
      `init`, config, flags, and the `skitterspec.config.json` migration.
- [ ] Run this repo's typecheck + test commands — green before the phase is done.

## Notes

- This closes the loop: skitterspec proves skittership works by being its first
  consumer. If the dependency mechanism is `npx`, note the pinned version so CI is
  reproducible.
