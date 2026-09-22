---
linear_issue_id: "SKS-376"
---

# Phase 6 — Docs, live smoke, first release ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the provider is documented, verified against a real Jira Cloud site,
and `skitterspec-jira@1.0.0` is staged through CI.

## Tasks

- [ ] `docs/jira.html` modelled on `docs/linear.html`; link it from
      `docs/index.html` + `docs/README.md`; extend `docs-claims.test.js`
      surfaces to cover it and the dist README.
- [ ] `assets/core/SETUP.md` for jira (API token creation, site URL, project
      key, status mapping) and the root README's provider table.
- [ ] Set up a free Jira Cloud site; record its URL in this phase's notes.
- [ ] Manual smoke checklist (written into `packages/jira/assets/core/SETUP.md`
      so users can re-run it): mint a spec issue + subtasks, push an update,
      adopt + preserve an existing issue, bucket move → transition, `verify`
      read-back clean, `released` scan on a test range, ADF task-list rendering
      (flip the phase-3 fallback if Jira drops it).
- [ ] Fix what the smoke surfaces; record each fix in the Changelog.
- [ ] Cut `skitterspec-jira@1.0.0` via `scripts/release.js`, push the tag, and
      `npm run approve` it per RELEASING.md.
- [ ] Full workspace suite green.
