---
linear_identifier: "SKS-296"
linear_url: "https://linear.app/skitterbyte/issue/SKS-296/say-what-linear-refused-and-find-the-way-back"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Say what Linear refused — and find the way back

> **Type:** Feature
> **Name:** feat-say-what-linear-refused (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-16)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-16
> **Area:** `packages/linear/src/api.js`, `packages/linear/src/cli-sync.js`, `packages/common/assets/skills/spec-push/SKILL.md`
> **Stack:** worktree

## Problem

A push failed twice today with one line:

```
spec-sync apply: transport = api
  !! Linear API error: usage limit exceeded
  ids stamped so far are saved — re-run to resume without duplicating
```

It cost an hour of wrong diagnosis. The line reads like a rate limit, so the
advice given was *wait for the window to reset* — and the reset was checked
(`x-ratelimit-requests-remaining: 2499 of 2500`), which ruled throttling out but
named nothing. The real answer was already in the response, one layer below what
the engine prints:

```json
{ "message": "usage limit exceeded",
  "extensions": {
    "code": "USAGE_LIMIT_EXCEEDED",
    "userError": true,
    "userPresentableMessage": "You've exceeded the free issue limit for this
      workspace. Please upgrade or contact sales@linear.app for a free trial.",
    "meta": { "usageMetric": "activeIssueCount" } } }
```

`api.js:168` maps every GraphQL error to `e.message` and drops `extensions`
entirely — so a message Linear wrote **for the user**, naming both the cause and
the fix, never reaches them. Worse, `userError: true` says this will never
succeed on retry, while the engine's only other failure mode (HTTP 429) says the
opposite. Both print as *"Linear API error"*, and they want opposite responses.

**And then there is getting back.** Two routes back exist and neither is solid:

- **Resume.** `applyOneSpec` does stamp each id the moment its object exists, so
  a re-run really is an update rather than a duplicate. But that guarantee is a
  comment (`cli-sync.js:2799`) with no test behind it, and it has a hole: if the
  create succeeds and the **stamp write** fails, the issue exists and nothing
  records it.
- **Re-attach.** A spec whose `linear_identifier` is gone has no way back at all.
  The next push mints a second issue over the top of a perfectly good one. That
  is not hypothetical: a stray `sed '1s/…'` clobbered a phase file's frontmatter
  earlier today, and the next push minted **SKS-284** beside the live
  **SKS-283**, which then had to be cancelled by hand.

## Decisions

1. **Relay Linear's own words, never a paraphrase.** When `extensions` carries
   `userPresentableMessage`, that is the message — Linear wrote it for the
   person reading it, and it names the fix. The code goes beside it so the cause
   is greppable.

2. **Classify, because the two failures want opposite responses.** `userError:
   true` (or a `code` in a known-unretryable set) means **waiting will not
   help**; an HTTP 429 means waiting is the whole answer. Say which, in the line
   the reader acts on. Getting this wrong is what produced the hour.

3. **Rejected: retrying a `userError`.** The retry loop exists for throttling,
   and a usage cap retried three times is three identical refusals and a slower
   failure. Unretryable errors fail once, immediately, with the reason.

4. **Resume becomes a tested guarantee, not a comment.** The claim is
   load-bearing — it is what makes "just run it again" safe advice — so it gets
   a test that kills the run between the create and the stamp and asserts the
   re-run links rather than mints.

5. **An orphaned create is closed by re-attach, not by a second write path.** If
   a stamp fails after its create, the issue exists unrecorded; rather than add
   recovery inside `apply`, that lands in the same place every other lost link
   does — decision 6.

6. **A spec can be pointed back at its issue.** `spec-sync reattach <spec>`
   finds candidate issues by title within the team, drops any identifier another
   spec already claims, and stamps the one that matches. **It never picks
   between several** — the same refusal `--claim-since` makes, for the same
   reason.

7. **Minting refuses over an unclaimed exact-title match.** This is the guard
   that would have stopped SKS-284. An exact title match in the same team, held
   by no spec, is a positive signal that the issue already exists — so the push
   names it and stops rather than creating a twin. `--force-new` is the escape
   for the genuine duplicate-title case, because being wrong here should cost a
   flag rather than a hand-cancelled issue.

8. **Nothing is read back into the repo.** `reattach` writes an id into the spec
   and nothing else — no description, no state, no title. The one-way rule is
   untouched: the repo stays the source of truth and the next push overwrites
   the mirror.

## Solution overview

**The error.** The client stops flattening. A GraphQL error becomes a structured
value carrying `message`, `code`, `userPresentableMessage`, `userError` and
`meta`; the retry loop skips a `userError`; and the reporting prints the
presentable message with a line saying whether waiting can help.

```
spec-sync apply: transport = api
  !! Linear refused this write — not a rate limit, so waiting will not help.
     You've exceeded the free issue limit for this workspace. Please upgrade
     or contact sales@linear.app for a free trial.
     (USAGE_LIMIT_EXCEEDED · activeIssueCount)
  nothing was created — re-run once that is resolved
```

**The way back.**

```
skitterspec spec-sync reattach <spec> [--to <ISSUE-REF>] [--json]
```

Bare, it searches the team for issues titled as this spec is, drops every
identifier `spec-sync linked` already accounts for, and reports what is left:
one candidate is stamped, several are listed and nothing is written, none says
so. `--to` names one exactly and skips the search — the escape hatch for a
renamed spec, and the scriptable form.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Engine API | update | the GraphQL client surfaces `extensions`; retry skips `userError` |
| CLI command | update | `spec-sync apply`/`push` report the presentable message and whether waiting helps |
| CLI command | add | `spec-sync reattach <spec> [--to <ref>] [--json]` |
| CLI command | update | minting refuses over an unclaimed exact-title match (`--force-new` overrides) |
| Skill | update | `/spec-push` — what a refusal means, and the way back |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Say what Linear refused, and whether waiting helps | ⬜ | [01-say-what-linear-refused.md](01-say-what-linear-refused.md) |
| 2 | Resume is a guarantee, not a comment | ⬜ | [02-resume-is-a-guarantee.md](02-resume-is-a-guarantee.md) |
| 3 | Point a spec back at its issue | ⬜ | [03-point-a-spec-back-at-its-issue.md](03-point-a-spec-back-at-its-issue.md) |

## Open questions

- [ ] None.

## Changelog

- 2026-09-16 — Spec created, from a push that failed twice reporting only
  `usage limit exceeded`. The cause — a free-plan `activeIssueCount` cap — was
  in `extensions.userPresentableMessage` the whole time, and was found only by
  wrapping `fetch` by hand to print the full payload.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |
| 2026-09-16 | In Progress | in-progress | Reuben Greaves |
