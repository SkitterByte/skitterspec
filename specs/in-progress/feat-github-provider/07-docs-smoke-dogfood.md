---
linear_issue_id: "SKS-415"
---

# Phase 7 — Docs, live smoke, dogfood swap, first release ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the provider is documented, smoke-tested live, this repo runs on it,
and `skitterspec-github@1.0.0` is staged through CI.

## Tasks

- [ ] `docs/github.html` on the jira page's model; links from `docs/index.html`
      and `docs/README.md`; `docs-claims.test.js` surfaces extended.
- [ ] `assets/core/SETUP.md`: classic PAT creation (scopes), board creation with
      Status + Deployed fields, which built-in board workflows to switch off,
      labels, and a re-runnable smoke checklist.
- [ ] Spike tasks moved from phase 1, first: confirm a classic PAT
      `repo`+`project` works on a user-owned board (and whether a fine-grained
      one does — Decision 5 changes if so); confirm the board's built-in
      workflows do not fight the engine's Status writes; confirm the GraphQL
      shapes the adapter assumes (`projectItems.fieldValueByName`,
      `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, sub-issue
      REST) against the live API.
- [ ] Live smoke on a throwaway repo + board: mint spec + phase sub-issues,
      bucket moves → Status + close reason, adopt + preserve, verify clean,
      ticked-box drift reported then replaced, `released` on a test range,
      `release create`/`deployed`/`complete`. Fix what surfaces; Changelog
      each fix.
- [ ] Dogfood swap in this repo: create the board, `github.config.json`
      replaces `linear.config.json`, push every backlog + in-progress spec
      (Decision 11), `release.yml` calls `release create` on tag push,
      `approve-release.cjs` calls `release complete`.
- [ ] Cut `skitterspec-github@1.0.0` via `scripts/release.js`, push the tag,
      `npm run approve` per RELEASING.md.
- [ ] Full workspace suite green.

## Notes

Credentials for the smoke and the dogfood are set by the operator in their own
terminal (`spec-sync credentials set`), never through the assistant. Rolling
skittership and skitterload over is the same swap, done in those repos.
