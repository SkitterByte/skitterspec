# Phase 1 — Outbound projection: title/description split, push-prep, states, fixture 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress

**Goal:** the local→Linear projection produces a *usable* mirror — short issue
titles with full-text descriptions, clean (hyphen-safe) markdown, and correct
project-state names — proven against a realistic spec fixture. All offline,
engine-side; no remote read.

## Tasks

- [ ] Add a realistic spec fixture under `packages/sync-core/test/fixtures/`
      (00-overview + phase files): hand-wrapped bullets, a multi-line `**Goal:**`,
      hyphenated compounds wrapped at the hyphen, `` `apps/**` ``-style globs
      inside code spans, a table, and a fenced code block. Use it in the tests below.
- [ ] Extend `normalizeLocal` task items from `{id,text,done}` to
      `{id,title,description,done}`: `description` = full task text (push-prep
      applied), `title` = first sentence of the description, falling back to the
      first ~100 chars at a word boundary. Add `titleFromText(text)` helper +
      unit tests (paragraph task, one-liner, sentence with `e.g.`/decimal edge).
- [ ] Fold the hyphen-join fix (from the pending hotfix branch) into
      `joinOpenSpans` and `cleanLogicalLine`; keep `canonicalizeMarkdown` /
      `joinEmphasisAcrossBreaks` as the **outbound push-prep** transform (used to
      build the pushed `description`/`goal`, never for remote comparison). Port
      the hotfix's red tests.
- [ ] Correct the shipped `states` defaults to Linear **project** statuses in
      `packages/linear/src/config.js` and `linear.config.json.example`
      (`Backlog / Planned / In Progress / Completed / Canceled`), keeping the
      local-bucket keys. Update `bucketForState`/`canonicalRemoteStatus` mapping
      + tests so lifecycle buckets map to the correct project state on push.
- [ ] Add a `validateStates(config, workspaceStates)` pure helper that returns
      the configured names not present in the workspace (the skill supplies the
      MCP-fetched list). Unit-test it; the loud-failure wiring lands in Phase 3's
      skill/CLI update.
- [ ] Add/extend tests: normalizeLocal over the realistic fixture yields the
      expected issues (short titles, full descriptions), milestones, and a
      hyphen-safe pushed description. Run the project's test command
      (`node --test`, see `.claude/rules/spec-planning.md`) — green before done.

## Notes

Push-prep stays hyphen-aware so a wrapped compound (`state-entry-with-`⏎
`assignment`) is rendered `state-entry-with-assignment` in the Linear payload
without editing the source file. This is where the absorbed hotfix lives; the
standalone `7.0.3` is dropped in favour of shipping it inside `8.0.0`.
