---
linear_issue_id: "SKS-376"
---

# Phase 6 — Docs, live smoke, first release 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress

**Goal:** the provider is documented, verified against a real Jira Cloud site,
and `skitterspec-jira@1.0.0` is staged through CI.

## Tasks

- [x] `docs/jira.html` modelled on `docs/linear.html`; link it from
      `docs/index.html` + `docs/README.md`; extend `docs-claims.test.js`
      surfaces to cover it and the dist README.
- [x] `assets/core/SETUP.md` for jira (API token creation, site URL, project
      key, status mapping) and the root README's provider table.
- [ ] Set up a free Jira Cloud site; record its URL in this phase's notes.
- [x] Manual smoke checklist (written into `packages/jira/assets/core/SETUP.md`
      so users can re-run it): mint a spec issue + subtasks, push an update,
      adopt + preserve an existing issue, bucket move → transition, `verify`
      read-back clean, `released` scan on a test range, ADF task-list rendering
      (flip the phase-3 fallback if Jira drops it).
- [ ] Fix what the smoke surfaces; record each fix in the Changelog.
- [ ] Cut `skitterspec-jira@1.0.0` via `scripts/release.js`, push the tag, and
      `npm run approve` it per RELEASING.md.
- [x] Full workspace suite green.

## Notes (in progress)

- The repo half is done: `docs/jira.html` (nav, verb table, per-distribution
  skill counts, all docs-claims guards extended and green), index/README
  cross-links, the jira `SETUP.md` with the eight-step release smoke checklist,
  and the dist recomposed carrying it.
- The remaining three tasks are the OPERATOR'S, and two of them can only
  happen after the spec lands: the live smoke needs a Jira Cloud site and
  credentials (never passed through an assistant — `credentials set` in your
  own terminal), and the `skitterspec-jira@1.0.0` cut runs `release.js` on the
  landed base branch, plus the npm trusted publisher configured on the
  registry and the 2FA approve.
- The docs-adaptation agent hit a session limit mid-run; the page it left was
  complete and passed every guard once the test surfaces were wired.
