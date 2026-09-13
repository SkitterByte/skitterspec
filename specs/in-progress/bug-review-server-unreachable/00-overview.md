---
linear_identifier: "SKS-206"
linear_url: "https://linear.app/skitterbyte/issue/SKS-206/bug-the-review-page-cannot-be-opened"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: the review page cannot be opened

> **Type:** Bug
> **Name:** bug-review-server-unreachable (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — phase 1 fixed, phases 2-3 to go
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-13
> **Area:** packages/common/src/cli.js, packages/common/src/env/serve.js, packages/common/assets/skills/spec-start
> **Stack:** worktree

## Symptom

Two separate failures, one symptom: the `open:` URL that `spec-env review`
prints does not open.

**(1) A daemon started inside a worktree dies with that worktree.** Renders had
been failing for every spec with:

```
render failed: ENOENT: no such file or directory, open
'/Users/reubengreaves/code/skitterspec-wt/skill-report-contract/packages/common/assets/review/page.html'
```

That worktree was removed at `/spec-complete`. The daemon kept running, kept
answering on port 7777, and failed on every page it was asked for — including
specs that had nothing to do with it.

**(2) A restart silently narrows the bind, and the URLs go on claiming LAN.**
`spec-env review serve --restart` came back bound to `127.0.0.1` only, while
`spec-env review` went on printing `http://192.168.0.241:7777/…` as the address
to open. On a phone that is "location can't be opened", with nothing anywhere
saying the server is loopback-only.

## Root cause

**(1)** `serveProcFor` (`packages/common/src/cli.js:1894`) builds the daemon's
command as `node ${path.join(__dirname, 'env', 'serve.js')}`. `__dirname` is the
module directory of whichever copy of the CLI is executing — run
`pnpm exec skitterspec` from a worktree and that is the worktree's copy, whose
`review.js` in turn resolves `TEMPLATE_PATH` into the worktree's `assets/`. The
worktree is then torn down and the daemon is left executing code that no longer
exists. Nothing else is worktree-relative: `cli.js:2650` already resolves `dir`
to the primary checkout, so the pages, the pidfile and the settings file were
always centralised. It is the script path alone.

Adoption cannot notice this. `ensureReviewServer` treats a live pid plus a
readable settings file as proof the server works — an absence never consulted
(`.claude/rules/negative-checks.md` rule 1), because the thing that broke is not
recorded anywhere.

**(2)** `specEnvReviewServe` passes `host: flags.host || '127.0.0.1'`
(`cli.js:2064`), so a `--restart` without `--host` re-binds to loopback rather
than keeping the host the running server had. Independently, the render path
asks for `host: '0.0.0.0'` but `ensureReviewServer` *adopts* a running server
whatever its bind and returns `loopback: true` — and `specEnvReview`
(`cli.js:1680`) never reads that field, printing `lanAddresses()` regardless.
So the two halves disagree and neither says so.

## Failing test (red)

`packages/common/test/cli-review-serve-ownership.test.js` —
`node --test test/cli-review-serve-ownership.test.js` in `packages/common`.

It asks `serveProcFor` for the daemon's command while standing in a worktree,
and the command it gets back names that worktree:

```
✖ the daemon is launched from the primary checkout, not from whoever started it
  AssertionError: the command should name the primary checkout's copy, got:
    node /Users/reubengreaves/code/skitterspec-wt/review-server-unreachable/
    packages/common/src/env/serve.js …/.spec-env/review-serve.json
```

That path is inside a worktree `/spec-complete` will delete — the bug, stated as
an assertion. Phases 2 and 3 carry their own tests.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI internal | update | `serveProcFor` takes the script root from the primary checkout |
| Config/state | add | `review-serve.json` records `script`, checked before adopting |
| CLI output | update | `spec-env review` prints loopback URLs for a loopback server, and says how to widen |
| CLI command | update | `review serve --restart` keeps the running host unless `--host` is given |
| Skill | update | `/spec-start` brings the server up from the primary checkout first |

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The daemon is owned by the primary checkout | ✅ | [01-primary-owned-daemon.md](01-primary-owned-daemon.md) |
| 2 | The bind and the URLs never disagree | ⬜ | [02-bind-matches-urls.md](02-bind-matches-urls.md) |
| 3 | `/spec-start` brings it up first | ⬜ | [03-spec-start-seam.md](03-spec-start-seam.md) |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-13 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-13 — Fixed (phase 1): the daemon's script is resolved against the
  primary checkout and recorded in `review-serve.json`, and a running server
  whose script has been deleted is replaced rather than adopted; test green.
  Verified against the original failure — from inside a worktree the daemon now
  resolves to the primary checkout's copy, and the dead
  `skill-report-contract` script is correctly judged non-adoptable.
- 2026-09-13 — Both failures reproduced while reviewing `feat-review-verdict`
  phase 1. Captured as one spec because they share a symptom and a surface, and
  phased because the fixes are independent.
