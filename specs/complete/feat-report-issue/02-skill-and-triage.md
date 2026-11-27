---
github_issue_id: "#339"
---

# Phase 2 — Skill, issue forms and triage wiring ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/spec-report-issue` ships in every distribution and drafts from
the allowlist, previews, then opens. Reports land labelled `triage` and show
up in `/spec --from-issue`.

## Tasks

- [x] Add `packages/common/assets/skills/spec-report-issue/SKILL.md`. It is
      model-invocable, and its description says it files to **skitterspec**,
      not the user's tracker, and should be offered instead of writing a
      scratch file or prompt. Steps: pick the kind, draft from the allowlist
      (Decision 3), run the preview and show it verbatim, ask, run `--open`
      on a yes, offer any duplicate as a link, and end on the report block
- [x] Add `.github/ISSUE_TEMPLATE/bug.yml` (labels `triage`, `bug`) and
      `feature.yml` (labels `triage`, `enhancement`), with field ids matching
      phase 1's constants, and `config.yml` keeping blank issues enabled
- [x] Set `intake.label: "triage"` in `specs/.core/github.config.json`
- [x] Add a row to the skill table in
      `packages/common/assets/rules/spec-planning.md` and a mention in
      `packages/common/assets/claude-md-section.md`
- [x] Update `docs/index.html`, and add the skill to `docs/reference.html`
      (its command row landed in phase 1), then run
      `node scripts/docs-freshness.js verify index reference`
- [x] Add a test that each form's field ids match the exported constants and
      that each form carries `triage`. Extend the distribution asset test so
      it expects the new skill in every distribution
- [x] Run `pnpm build` and `pnpm test` until green

## Manual steps

- [x] Create the `triage` label on SkitterByte/skitterspec (Issues → Labels →
      New label). `bug` and `enhancement` already exist

## Notes

After landing, check once: file a test report from another project with
`/spec-report-issue`, see it arrive labelled `triage`, then close it. GitHub
reads issue forms from the default branch only, so this cannot run before
the spec lands.
