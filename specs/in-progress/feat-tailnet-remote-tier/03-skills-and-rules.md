---
github_issue_id: "#253"
---

# Phase 3 — Skills, rules and the command ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** no shipped skill, rule or command mentions publishing a review, and
every banner template names `local` / `network` / `remote` as same-room doors.
The asset tests prove it.

## Tasks

- [x] Delete `packages/common/assets/commands/spec-remote-review.md` and the
      repo's `.claude/commands/spec-remote-review.md`. Check that `update`
      retires it (manifest).
- [x] `spec-reports.md`: rewrite the tier table (remote = tailnet, off when
      `network` is off), and fold the `also:` paragraph down to the non-tailnet
      remainder. Remove the published-page transport, the "different stores"
      prose and the remote caveat. Change the banner example to
      `the wait covers local, network and remote`. Record the fourth amendment
      and its argument (Decision 11).
- [x] `spec-planning.md`: drop the `/spec-remote-review` paragraphs and table
      mentions, and the "published page" passages in the review-pass section.
- [x] `spec-diff/SKILL.md`: remove the publish flow (Artifact, `.publish.html`,
      allow-remote).
- [x] Banner templates in `spec`, `spec-next`, `no-spec`, `spec-bug` and
      `spec-hotfix`, plus mentions in `spec-complete`, `spec-cancel`,
      `spec-start`, `spec-tada`, `spec-todo`, `spec-review`, `spec-reviewed`
      and `spec-idea`: name the tailnet door `remote` and drop the publish
      lines.
- [x] `allow-main.md` command, `claude-md-section.md` and the repo
      `CLAUDE.md`: remove the `/spec-remote-review` and published-page
      sentences.
- [x] `assets/core/env.config.md` and `env.config.json.example`: remove
      `allowRemote`, and note that it is retired and ignored.
- [x] Tests: update `assets-banner-stack`, `assets-published-docs`,
      `assets-allow-main` and `assets-offered-unblocks`, plus any
      skill-budget or claude-md-section checks. Run `pnpm typecheck` and
      `pnpm test`, and get both green.

## Notes

- The skill banners take the holding line from the engine
  (`the wait covers <the tiers the engine's covers names>`) instead of a fixed
  list, because a reader on another machine is never shown `local`.
- `spec-planning.md` names the retired command as `spec-remote-review`, with no
  leading slash, because `assets-prose` rejects any `/spec-…` name that does
  not ship.
- To keep the command tables and coverage tests green, phase 3 had to edit some
  docs: the `/spec-remote-review` rows in three READMEs, the chip on
  `docs/index.html`, the `covers` glob on `docs/review.html` and that page's
  remote card. The prose rewrite is still phase 4.
- `specs/.core/env.config.md`, this repo's own installed copy, took the same
  retired-key wording as the asset.
