---
linear_issue_id: "SKS-374"
---

# Phase 4 — Jira CLI, skills, seams ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec-jira spec-sync` exposes the core subcommand set with
Linear-matching exit-code semantics; the 6 skills and 8 seam fragments compose
cleanly.

## Tasks

- [ ] `bin/skitterspec-jira.js` on the linear bin pattern: refuse on missing
      composed `src/`, `assertComposedAssets()` before init/update, base HELP +
      provider section, provider routing with exit-code propagation, delegate
      the rest to common's `run`.
- [ ] `src/commands.js` + `spec-sync` dispatch built on the kit's parser and
      plumbing. Subcommands: `normalize`, `plan`, `apply` (single + `--all`),
      `stamp`, `record`, `status`, `verify`, `doctor`, `released`, `ref`,
      `list`, `linked`, `states`, `preserve`, `credentials`, `init-config`.
      Exit semantics mirror the linear table (stdout-only-on-success `ref`,
      warn-never-fail `verify`, always-0 `preserve` cannot-tells, dry-run
      defaults).
- [ ] `states` reports the configured project's statuses and `--json` emits the
      array the state-gate flags consume; `plan` refuses without it exactly as
      linear's `stateCheckFailure` does — Jira also accepts unknown status
      names silently in some flows, same axiom.
- [ ] MCP transport: matchers for Atlassian's official remote MCP server tool
      names (issue read/create/edit/search/transition), `REQUIRED` minimum,
      runtime discovery, per-command degradation (impossible ops exit 1 and say
      so; the rest exit 0 with the file-handoff instructions).
- [ ] Skills: `spec-push`, `spec-status`, `spec-sync`, `spec-list` (jira
      wording, same user-only markings), and `spec-jira-setup` (interview →
      validate against the live site → write `jira.config.json`; modelled on
      `spec-linear-setup`).
- [ ] Seam fragments for all 8 names: `spec-tracker-{intake,link,assign*,
      sync,progress,start}`, `spec-next-start`, `spec-project-picker` (the
      Decision 10 one-liner). *`spec-tracker-assign` fills with a short
      "assignment sync not yet supported" note since Decision 3 defers it —
      the seam must still fill or the marker leaks.
- [ ] `assets/rules/commit-trailers.md` jira edition (`Refs: PROJ-123`,
      engine command `pnpm exec skitterspec-jira spec-sync ref`, no
      magic-word ban needed — but keep the one-ref-per-commit rules).
- [ ] CLI tests mirroring linear's: exit codes, unknown flag refusal, help,
      state gate, stamp validation, preserve idempotence, adoption flow.
- [ ] Full workspace suite green.
