---
github_issue_id: "#49"
---

# Phase 3 — Workflow + docs; clear this repo's backlog ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** any GitHub+npm adopter can wire reconcile from the docs alone, and
this repo's nine stuck releases move to Published by running it.

## Tasks

- [x] Add `.github/workflows/reconcile-releases.yml` to this repo: hourly cron
      (`17 * * * *`) + `workflow_dispatch`, `actions/checkout` with
      `fetch-depth: 0`, pnpm install, then
      `spec-sync release reconcile --apply` with
      `GITHUB_TOKEN: ${{ secrets.SKITTERSPEC_GITHUB_TOKEN }}`. Never fatal on
      "nothing to do"; no-secret runs say so and exit 0, matching release.yml's
      mirror step.
- [x] Add `"npm"` to every series in this repo's
      `specs/.core/github.config.json` — including a new
      `skitterspec-azure-boards@` series, which was missing entirely.
- [x] Document for adopters in the shipped assets
      (`packages/github/assets/core/`): `github.config.md` gained a "Releases"
      section (series fields, reconcile semantics, copy-paste workflow);
      `SETUP.md`'s Deployed-field bullet points at it with the PAT note; the
      spec-sync `SKILL.md` gained §7b covering
      `create | deployed | complete | reconcile`.
- [x] Note in `RELEASING.md` (and the approve script's header comment) that web
      approvals are fine: reconcile is the safety net, `npm run approve`'s
      mirror just makes the board instant.
- [x] Extend `scripts/workflows.test.js` to cover the new workflow (schedule +
      dispatch, fetch-depth 0, secret guard, applies the verb, no
      registry-url).
- [x] Acceptance: dry run named 13 stuck releases + 2 backfills and nothing
      else; `--apply` moved all 13 to Published, backfilled
      `skitterspec-azure-boards@1.2.1` (published) and `skitterspec-jira@1.2.1`
      (kept at Staged — genuinely not on npm). Verified on GitHub: every live
      release reads `stage=published`, prerelease cleared; a repeat dry run
      reports only the jira keep.
- [x] Run `pnpm test` — 4201 pass.

## Notes

- The acceptance run doubles as the live fix for the current board — no
  separate backfill chore needed afterwards.
