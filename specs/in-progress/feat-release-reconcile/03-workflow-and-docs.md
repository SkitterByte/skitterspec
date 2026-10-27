---
github_issue_id: "#49"
---

# Phase 3 — Workflow + docs; clear this repo's backlog ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** any GitHub+npm adopter can wire reconcile from the docs alone, and
this repo's nine stuck releases move to Published by running it.

## Tasks

- [ ] Add `.github/workflows/reconcile-releases.yml` to this repo: hourly cron
      + `workflow_dispatch`, `actions/checkout` with `fetch-depth: 0`, pnpm
      install, then `spec-sync release reconcile --apply` with
      `GITHUB_TOKEN: ${{ secrets.SKITTERSPEC_GITHUB_TOKEN }}`. Never fatal on
      "nothing to do"; no-secret runs say so and exit 0, matching release.yml's
      mirror step.
- [ ] Add `"npm"` to every series in this repo's
      `specs/.core/github.config.json`.
- [ ] Document for adopters in the shipped assets
      (`packages/github/assets/core/`): `github.config.md` gains the
      `releases.series[].npm` field and reconcile semantics (containment,
      backfill bound, absence-is-not-failure); `SETUP.md`'s Deployed-field
      section gains the copy-paste workflow and the PAT note (Actions'
      `GITHUB_TOKEN` cannot write a user-owned Projects v2 board); the
      spec-sync `SKILL.md` gains a release-verbs section covering
      `create | deployed | complete | reconcile` — today the release seam is
      undocumented there.
- [ ] Note in `RELEASING.md` (and the approve script's header comment) that web
      approvals are fine: reconcile is the safety net, `npm run approve`'s
      mirror just makes the board instant.
- [ ] Extend `scripts/workflows.test.js` to cover the new workflow (cron
      present, dispatch present, fetch-depth 0, secret guard).
- [ ] Acceptance: run `spec-sync release reconcile` dry against this repo,
      confirm the plan names the nine stuck releases (and jira/azure backfill
      candidates) and nothing else; then `--apply` and verify the Deployed
      badges read Published and GitHub's Latest is still the newest tag per
      series.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

- The acceptance run doubles as the live fix for the current board — no
  separate backfill chore needed afterwards.
