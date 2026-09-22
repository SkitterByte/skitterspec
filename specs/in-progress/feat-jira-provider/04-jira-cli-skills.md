---
linear_issue_id: "SKS-374"
---

# Phase 4 — Jira CLI, skills, seams ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `skitterspec-jira spec-sync` exposes the core subcommand set with
Linear-matching exit-code semantics; the 6 skills and 8 seam fragments compose
cleanly.

## Tasks

- [x] `bin/skitterspec-jira.js` on the linear bin pattern: refuse on missing
      composed `src/`, `assertComposedAssets()` before init/update, base HELP +
      provider section, provider routing with exit-code propagation, delegate
      the rest to common's `run`.
- [x] `src/commands.js` + `spec-sync` dispatch built on the kit's parser and
      plumbing. Subcommands: `normalize`, `plan`, `apply` (single + `--all`),
      `stamp`, `record`, `status`, `verify`, `doctor`, `released`, `ref`,
      `list`, `linked`, `states`, `preserve`, `credentials`, `init-config`.
      Exit semantics mirror the linear table (stdout-only-on-success `ref`,
      warn-never-fail `verify`, always-0 `preserve` cannot-tells, dry-run
      defaults).
- [x] `states` reports the configured project's statuses and `--json` emits the
      array the state-gate flags consume; `plan` refuses without it exactly as
      linear's `stateCheckFailure` does — Jira also accepts unknown status
      names silently in some flows, same axiom.
- [x] MCP transport: matchers for Atlassian's official remote MCP server tool
      names (issue read/create/edit/search/transition), `REQUIRED` minimum,
      runtime discovery, per-command degradation (impossible ops exit 1 and say
      so; the rest exit 0 with the file-handoff instructions).
- [x] Skills: `spec-push`, `spec-status`, `spec-sync`, `spec-list` (jira
      wording, same user-only markings), and `spec-jira-setup` (interview →
      validate against the live site → write `jira.config.json`; modelled on
      `spec-linear-setup`).
- [x] Seam fragments for all 8 names: `spec-tracker-{intake,link,assign*,
      sync,progress,start}`, `spec-next-start`, `spec-project-picker` (the
      Decision 10 one-liner). *`spec-tracker-assign` fills with a short
      "assignment sync not yet supported" note since Decision 3 defers it —
      the seam must still fill or the marker leaks.
- [x] `assets/rules/commit-trailers.md` jira edition (`Refs: PROJ-123`,
      engine command `pnpm exec skitterspec-jira spec-sync ref`, no
      magic-word ban needed — but keep the one-ref-per-commit rules).
- [x] CLI tests mirroring linear's: exit codes, unknown flag refusal, help,
      state gate, stamp validation, preserve idempotence, adoption flow.
- [x] Generalise the apply orchestration (plan→apply→stamp-as-you-go→verify→
      record, orphan accounting) into the kit with jira as the second consumer,
      and rewire linear onto it (deferred from phase 2 so the hook shape is
      validated by two providers).
- [x] Build jira's credentials command layer on the kit store + prompt helpers;
      hoist whatever of linear's command layer proves genuinely shared.
- [x] Full workspace suite green.

## Notes (built)

- The apply orchestration generalised into the kit (`provider-kit/src/apply.js`)
  with BOTH providers as consumers: linear's ops fold state ids into payloads,
  jira's move status by transition after each create/update — the hook shape
  the phase-2 deferral waited for. Linear's whole suite passes unchanged on it.
- Jira's CLI is ~1/4 the size of linear's by building on the kit (spec helpers,
  flag parser, transport, prompts, verify rendering — all shared). Its
  credentials command layer is jira's own thin skin over the kit store: the
  email is prompted visibly (not a secret), the token hidden.
- `spec-sanitise` is deliberately absent: ADF has no straddle mangle.
- The seam set is the full nine, with `spec-tracker-assign` and
  `spec-project-picker` as deliberate short fills (assignment deferred; no
  picker by design). Skills shipped: spec-push, spec-status, spec-sync,
  spec-list, spec-jira-setup — no spec-claim (assignment deferred).
- `commit-trailers.md` swaps Linear's magic-words rule for the smart-commit
  analogue: `#comment`/`#time`/`#<transition>` act when a commit is scanned,
  so `Refs:` stays the one deliberately inert reference.
