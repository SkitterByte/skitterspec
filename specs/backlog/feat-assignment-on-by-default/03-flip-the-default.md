---
linear_issue_id: "SKS-288"
---

# Phase 3 — flip the default, invert the setup, write the migration ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a freshly configured repo assigns its specs without anyone opting in,
and an existing one is told what changed — proven by a config with no `sync`
block projecting an assignee.

## Tasks

- [ ] Add `assignee: 'push'` to `DEFAULT_CONFIG.sync.fieldOwnership`
      (`packages/linear/src/config.js:175`) and rewrite the comment above it —
      it currently explains why this field is the one that opts in.
- [ ] Replace `--assign` with `--no-assign` in `init-config`
      (`packages/linear/src/cli-sync.js:3342`, the draft-builder at `:2945`,
      and the usage string at `:3509`), writing
      `sync.fieldOwnership.assignee: "none"`.
- [ ] Invert `/spec-linear-setup` step 7b
      (`packages/linear/assets/skills/spec-linear-setup/SKILL.md:181`) — ask
      whether to turn assignment **off**, and write only on yes.
- [ ] Update the three assignment seams
      (`packages/linear/assets/seams/spec-tracker-assign.md`,
      `spec-tracker-sync.md`, `spec-next-start.md`) and the core docs
      (`linear.config.md`, `SETUP.md`, `linear.config.json.example`) — every
      "only when `sync.fieldOwnership` includes `assignee`" becomes an
      is-owned test.
- [ ] Write the MIGRATION.md `v15 → v16` section: what flips, why it cannot
      clobber an existing Linear assignment (decision 7), the one-line opt-out,
      and that an explicit `"assignee": "push"` is now redundant but harmless.
- [ ] Bump `@skitterbyte/skitterspec-linear` to v16 per
      [RELEASING.md](../../../RELEASING.md).
- [ ] Tests: a config with no `sync` block projects an assignee; `--no-assign`
      writes the `none` value and nothing else; `--assign` is now an unknown
      flag and fails loudly (`cli-unknown-flag.test.js`); `assets.test.js`
      still passes over the reworded skills and seams.
- [ ] **Stays-silent test:** upgrading a repo that has linked specs with
      **no** `assignee` key in their snapshots emits no assignee op at all —
      neither an assert nor a clear — for any spec that carries no
      `linear_assignee_id`. This is the one that proves decision 7, and its
      absence is what would ship a workspace-wide retriage.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

Decisions 7 through 11. The stays-silent test above is the load-bearing one:
`feat-linear-assignment` decisions 6 and 9 are what make this flip safe, and
this phase is where they stop being reasoning and become a regression test.
