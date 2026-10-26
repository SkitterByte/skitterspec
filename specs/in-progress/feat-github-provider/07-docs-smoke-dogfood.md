---
linear_issue_id: "SKS-415"
github_issue_id: "#8"
---

# Phase 7 — Docs, live smoke, dogfood swap, first release 🔄

> Spec: [00-overview.md](00-overview.md) · **Status:** In progress

**Goal:** the provider is documented, smoke-tested live, this repo runs on it,
and `skitterspec-github@1.0.0` is staged through CI.

## Tasks

- [x] `docs/github.html` on the jira page's model; links from `docs/index.html`
      and `docs/README.md`; `docs-claims.test.js` surfaces extended.
- [x] `assets/core/SETUP.md`: classic PAT creation (scopes), board creation with
      Status + Deployed fields, which built-in board workflows to switch off,
      labels, and a re-runnable smoke checklist.
- [x] Spike tasks moved from phase 1, first: confirm a classic PAT
      `repo`+`project` works on a user-owned board (and whether a fine-grained
      one does — Decision 5 changes if so); confirm the board's built-in
      workflows do not fight the engine's Status writes; confirm the GraphQL
      shapes the adapter assumes (`projectItems.fieldValueByName`,
      `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, sub-issue
      REST) against the live API. *(Classic PAT confirmed; fine-grained not
      tried — Decision 5 stands. The board's auto-close on Done does race the
      engine's close; settle now accepts it.)*
- [x] Live smoke on a throwaway repo + board: mint spec + phase sub-issues,
      bucket moves → Status + close reason, adopt + preserve, verify clean,
      ticked-box drift reported then replaced, `released` on a test range,
      `release create`/`deployed`/`complete`. Fix what surfaces; Changelog
      each fix. *(Run on this repo instead. Release verbs dry-run only; the
      real write is the 1.0.0 tag itself.)*
- [x] Dogfood swap in this repo: create the board, `github.config.json`
      replaces `linear.config.json`, push every backlog + in-progress spec
      (Decision 11), `release.yml` calls `release create` on tag push,
      `approve-release.cjs` calls `release complete`. *(Board 2 created and
      every backlog + in-progress spec pushed (#1–#30); `release.yml` mirrors
      on the `SKITTERSPEC_GITHUB_TOKEN` secret; approve runs `deployed
      published` + `complete`. Retiring `linear.config.json` waits for the
      1.0.0 cut — the repo's skills come from the installed Linear dist.)*
- [x] After the cut: install `skitterspec-github` here, remove
      `linear.config.json`, re-run init, and switch the `Refs:` trailer to
      `#N`. *(`.claude/skills` and `commit-trailers.md` relinked to the GitHub
      dist; the `skitterspec` bin alias moved from `packages/linear` to
      `packages/github`; the Linear config and its docs removed, the GitHub
      config docs added. `init` was run on a scratch copy first: only its
      tracker files were taken — its hooks and new commands are a separate
      decision. `spec-sync ref` now answers `#1`.)*
- [x] Cut `skitterspec-github@1.0.0` via `scripts/release.js`, push the tag,
      `npm run approve` per RELEASING.md. *(First publish bootstrapped from the
      operator's machine, as `skitterspec-jira@1.0.0` was — no trusted
      publisher can exist before the package does. The board half of approve
      did not land; `release deployed … published` + `release complete` were
      re-run by hand and the release is no longer a prerelease.)*
- [x] Full workspace suite green. *(4011 passed.)*

## Notes

Credentials for the smoke and the dogfood are set by the operator in their own
terminal (`spec-sync credentials set`), never through the assistant. Rolling
skittership and skitterload over is the same swap, done in those repos.

## Notes (in progress)

- **Repo half done:** `docs/github.html` (setup, the board-as-state model, check,
  releases, the full verb table — guarded by `docs-claims.test.js`, which now
  covers the page, the dist README and the github core docs), links from the
  index, docs README and both other provider pages. SETUP.md was written in
  phase 3.
- **What is left is the operator's**, in this order: a throwaway public repo +
  user-owned board + classic token (`repo`, `project`) for the smoke; then this
  repo's own board and the dogfood swap; then the 1.0.0 cut after landing, with
  the npm trusted publisher configured first. Tokens are set in your terminal
  (`spec-sync credentials set`), never through the assistant.
- **Live run 1 — 2026-10-22, against SkitterByte/skitterspec, board 2** (the
  smoke target moved from a throwaway repo to this repo, which is also the
  dogfood; config still uncommitted while it runs). Confirmed live: a classic
  PAT `repo`+`project` works on a user-owned board; doctor's scope, board-state
  and Deployed-field checks; the board/field GraphQL shapes; mint of #1 + #2–#8
  as linked, labelled sub-issues with Status and close reasons; 8 bodies
  round-tripped; `released` over 179 real commits counting 66 `SKS-N` trailers
  as historical; Linear still reads its key after the store went v1 → v2.
- **Found and fixed live:** (1) the board's built-in *auto-close on Done*
  closed the phase issue before our own close, and GitHub refused ours as
  "closed by another request" — settle now re-reads after a Status change and
  accepts that refusal once a re-read shows the issue closed; (2) a settle
  failure after a create did not name the created issue — `orphan` is now
  attached, so the refusal says what to stamp. Recovered with
  `stamp --sub 01-…=#2` and a resumed apply. (3) Items added by
  `addProjectV2ItemById` existed (by id, and in `issue.projectItems`) but were
  missing from `ProjectV2.items`, the board view and the repo issue list for
  over an hour. First blamed on GitHub bug #188487; it was a GitHub incident
  (Issues degraded, 2026-10-22) and cleared by itself — all 8 items then read
  back with the right Status. `list` stays on search plus each issue's own
  board item, which was correct throughout. Sync sets fields by item id and
  was unaffected.
- **Live run 2 — after the incident cleared:** board and repo issue list read
  all 8 items with the right Status. Spec-issue drift works: an edit to #1's
  body on GitHub is reported by `status --remote`, and was reverted after. A
  box ticked on phase issue #8 was replaced by the next push WITHOUT a warning
  — sub-issue bodies carry no description hash (kit-wide; see Changelog).
  `release create` dry runs over real tags: ranges right, and the report now
  counts commits carrying an earlier tracker's ref (24 `SKS-` in 23.1.0) where
  it used to drop them silently.
- **Live run 3 — adopt:** a hand-filed #31 listed by `intake` (after a
  short REST listing lag — the first read said nothing waiting), adopted by a
  throwaway spec: `preserve` posted the original as a comment and was a no-op
  the second time, the linking push replaced the body and minted #32, and
  cancelling closed #31 as not planned. Two fixes: #32 stayed open in Backlog
  under its cancelled parent (now projected cancelled, kit-wide), and #31
  never got the `spec` label `list` searches by (now added on update). The
  throwaway spec was deleted uncommitted; #31/#32 stay closed.
- **Fixed in this spec:** phase sub-issues now get the same `!!` edit warning
  as the spec issue — the snapshot records a word-stream hash per phase body
  (`subIssueStreams`), and apply reads a sub-issue before replacing it only
  where one is recorded.
