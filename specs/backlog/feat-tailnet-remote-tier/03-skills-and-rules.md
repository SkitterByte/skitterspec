---
github_issue_id: "#253"
---

# Phase 3 — Skills, rules and the command ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** no shipped skill, rule or command mentions publishing a review, and
every banner template names `local` / `network` / `remote` as same-room doors.
The asset tests prove it.

## Tasks

- [ ] Delete `packages/common/assets/commands/spec-remote-review.md` and the
      repo's `.claude/commands/spec-remote-review.md`. Check that `update`
      retires it (manifest).
- [ ] `spec-reports.md`: rewrite the tier table (remote = tailnet, off when
      `network` is off), and fold the `also:` paragraph down to the non-tailnet
      remainder. Remove the published-page transport, the "different stores"
      prose and the remote caveat. Change the banner example to
      `the wait covers local, network and remote`. Record the fourth amendment
      and its argument (Decision 11).
- [ ] `spec-planning.md`: drop the `/spec-remote-review` paragraphs and table
      mentions, and the "published page" passages in the review-pass section.
- [ ] `spec-diff/SKILL.md`: remove the publish flow (Artifact, `.publish.html`,
      allow-remote).
- [ ] Banner templates in `spec`, `spec-next`, `no-spec`, `spec-bug` and
      `spec-hotfix`, plus mentions in `spec-complete`, `spec-cancel`,
      `spec-start`, `spec-tada`, `spec-todo`, `spec-review`, `spec-reviewed`
      and `spec-idea`: name the tailnet door `remote` and drop the publish
      lines.
- [ ] `allow-main.md` command, `claude-md-section.md` and the repo
      `CLAUDE.md`: remove the `/spec-remote-review` and published-page
      sentences.
- [ ] `assets/core/env.config.md` and `env.config.json.example`: remove
      `allowRemote`, and note that it is retired and ignored.
- [ ] Tests: update `assets-banner-stack`, `assets-published-docs`,
      `assets-allow-main` and `assets-offered-unblocks`, plus any
      skill-budget or claude-md-section checks. Run `pnpm typecheck` and
      `pnpm test`, and get both green.
