---
linear_identifier: "SKS-394"
linear_url: "https://linear.app/skitterbyte/issue/SKS-394/bug-spec-remote-review-dirties-main-and-never-re-shows-the-review"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: /spec-remote-review dirties main and never re-shows the review

> **Type:** Bug
> **Name:** bug-remote-review-toggle (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-20
> **Area:** `packages/common/src/cli.js` (`specEnvReviewAllow`, `specEnvReview`), `src/env/review.js`, `src/env/serve.js`, `assets/commands/spec-remote-review.md`, `assets/skills/spec-diff/SKILL.md`

## Symptom

Reported by the operator after a session in `ereqs`:

> "I was off the network today and working, got a review but remote wasn't
> enabled, the prompt told me I could enable with the command. I used the
> command and some subtle issues happened. Firstly it updated the settings but
> on MAIN branch (I was on a worktree) - secondly as there was an active review
> I expected to be reshown the review with the links, including the remote link
> for the artifact, but I was not. When I asked for the link I got an error on
> permissions setting up the artifact - so the artifact was never created and
> the review had to wait until I was back on the server"

Repro: a phase ends and its banner shows `remote: off — turn on with:
/spec-remote-review`. Type it from the spec's worktree. The engine writes
`review.allowRemote: true` into the primary checkout's committed
`specs/.core/env.config.json`, leaving `main` dirty, and the command relays
that output and stops. Nothing publishes the page and nothing re-shows the
banner.

## Root cause

Two causes in skitterspec, plus one outside it.

1. `specEnvReviewAllow` (`packages/common/src/cli.js:2546`) writes
   `path.resolve(dir, 'specs/.core/env.config.json')`, and `dir` has already
   been re-anchored on the primary checkout. Config is only ever read from
   there (`loadEnvConfig(dir)`, `cli.js:5112`), so the permission is
   project-wide by construction: every spec in the repo can then publish,
   and the base branch is dirty.
2. The command file (`assets/commands/spec-remote-review.md`) says *"Relay
   the engine output above verbatim. Add nothing and run nothing else"*, and
   the engine's output says nothing about the review the operator typed it
   for. So the model just relayed it, and the remote link the operator was
   waiting for never appeared.
3. *(Not skitterspec.)* When the operator then asked for the link, Claude
   Code's auto-mode classifier refused the `Artifact` publish as "Data
   Exfiltration", and refused the later claim command too. That is the
   harness's permission decision, so there is nothing to fix in code.
   Recording it so the next reader doesn't go looking for it.

## Failing test (red)

`packages/common/test/env-review-remote-per-spec.test.js`.
Run it with `node --test test/env-review-remote-per-spec.test.js` from
`packages/common`.

- `allow remote for a spec leaves the committed config and the base branch alone`
  — `not ok`: the committed file changed.
- `the permission applies to that spec and no other` — `not ok`: `beta still
  may not`.
- `turning remote on beside a rendered review names it for publishing` — `not
  ok`: no `review:` / `publish:` lines.
- Stays-silent: no page or `off` names nothing to publish, and a committed
  `allowRemote: true` still applies to every spec.

## Fix

- [x] `allow remote [<spec>]` resolves the spec (an explicit name, the
      worktree you're standing in, or the sole provisioned spec) and writes a
      per-spec `<spec>.remote.json` into the gitignored review store, not the
      committed config. `--project` keeps the old committed write for anyone
      who wants it team-wide.
- [x] The review render and the served page layer that sidecar over
      `config.review.allowRemote`, so the permission covers that spec only.
- [x] When remote turns ON and the spec already has a page, the engine names
      it: `review:` and `publish:` lines.
- [x] `/spec-remote-review` treats those lines as the request to publish:
      it publishes per `/spec-diff` §6 and then re-emits the banner. It
      still never publishes when no page is named.
- [x] `network` stays project-level. One server binds for every spec, so a
      per-spec bind isn't possible.
- [x] Docs: `spec-diff` §2b, `spec-planning.md`, `env.config.md`, the
      package README. The package `assets/` are build output, so there is
      nothing to resync.
- [x] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env review allow remote [<spec>] [--set on\|off\|''] [--project]` |
| Config key | update | `review.allowRemote` becomes the project default; a per-spec sidecar overrides it |
| State file | add | `.spec-env/reviews/<spec>.remote.json` (gitignored) |
| Slash command | update | `/spec-remote-review` publishes and re-shows a named page |
| Skill/rule | update | `spec-diff` §2b `allow-remote` row; `spec-planning.md` |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-20 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-10-20 — Bug reproduced; failing test added (red).
- 2026-10-20 — Decided with the operator: remote permission is a per-worktree
  (per-spec) setting rather than a codebase one, so what can generate an
  artifact is decided per spec; turning it on beside a waiting review publishes
  and re-shows the stack.
- 2026-10-20 — `/spec-remote-review` is no longer a pure relay. It publishes
  only when the engine prints `review:`/`publish:` lines, so deciding whether
  there is a page stays in the engine. `spec-connect` and `spec-live` keep the
  strict relay contract, and the stays-silent test now records the exception.
- 2026-10-20 — `/spec-remote-review` resolves the spec from the session's cwd,
  so typed from the primary checkout with several specs provisioned it refuses
  and changes nothing. It no longer falls back to the project-wide write.
- 2026-10-20 — Fixed: remote permission is a per-spec sidecar and the toggle names a waiting page to publish; test green (3593 pass).
