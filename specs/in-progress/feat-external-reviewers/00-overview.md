---
linear_identifier: "SKS-334"
linear_url: "https://linear.app/skitterbyte/issue/SKS-334/external-code-reviewers-on-the-review-page"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# External code reviewers on the review page

> **Type:** Feature
> **Name:** feat-external-reviewers (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-17)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-17
> **Area:** packages/common/src/env/review.js, packages/common/src/env/config.js, packages/common/src/cli.js, packages/common/assets/review/page.html, packages/common/assets/skills/spec-next, packages/common/assets/skills/spec-diff, packages/common/assets/rules/spec-planning.md
> **Stack:** worktree

## Problem

A phase is written by a model and reviewed by the person who asked for it. That
person is reading a diff they did not write, at the end of a phase, on a phone
as often as not — and the one thing that would sharpen it, a second opinion from
something that did not write the code, is not available anywhere in the loop.
Several such reviewers now run from a CLI (CodeRabbit's has a free tier;
PR-Agent, Kodus and others are self-hosted), and every one of them emits findings
in exactly the shape the page already renders.

What is missing is not a reviewer — it is the **seam**. Skitterspec vendors no
tracker and no commit skill for the same reason it should vendor no reviewer:
the project picks, and skitterspec bakes in the offer.

## Decisions

1. **A reviewer's findings are `checks`, never `comments`.** The engine already
   has both: `renderReviewBlock` renders `checks` (`flag`/`confirm`/`good`) and
   `judgeVerdict` refuses a committing verdict while any **comment** is
   unresolved. A comment is something a person asked for; twelve machine
   findings are not. So machine findings inform and never gate — and a human
   reply to one becomes a comment carrying `check: <id>`, which *does* gate,
   because now someone asked. **Rejected:** a `blockAt: "critical"` threshold —
   it is the counting gate this whole design exists against, wearing a vendor's
   name, and it makes a reviewer's bad day into a wall.
2. **Two ways to configure one, and the split is who owns the command line.**
   `{ "use": "coderabbit" }` names a bundled adapter — the engine owns its flags
   and its parser. `{ "name": …, "command": …, "format": "rdjsonl" }` is
   bring-your-own: any command that prints rdjsonl works, so an adapter is a
   twenty-line script rather than a plugin API. **Rejected:** a single
   `command` template with vendor-shaped substitutions like `${scope_flags}` —
   that leaks one vendor's CLI grammar into the engine's config schema.
3. **rdjsonl is the native contract** — one JSON object per line,
   `{path, range:{start:{line}}, severity, message}`. It is reviewdog's
   interchange format, so most linters and several reviewers already emit it and
   a project gets non-AI checks on the same page for free. **Rejected:** SARIF
   (correct, universal, and far too heavy to hand-write in a shell script) and a
   bespoke skitterspec shape (one more format in a world that has enough).
4. **They run at phase end and on demand, never on a timer.** `/spec-next` runs
   them after tests go green and before the render, so the page is already
   populated when it is opened; `/spec-diff --reviewers` is the opt-in mid-phase
   run. Both go through one engine flag, `spec-env review <spec> --run-reviewers`.
5. **The run blocks the render, and caches by diff hash.** A reviewer takes
   30s–3min; the run is about to wait on a human for far longer, so blocking
   before the render is the cheap half. A re-render of unchanged work reuses the
   cached findings rather than spending another review — which matters on a free
   tier measured in reviews per hour.
6. **"Did not run" is reported, never silent** — and this is the one place the
   negative-checks rule inverts on itself. Silence is normally the safe branch,
   but a reviewer that was rate-limited, unauthenticated or not installed would
   then render identically to one that ran and found nothing. That is a false
   clean, on the page a commit decision is made from. So every configured
   reviewer gets a line stating its outcome — `12 findings` · `clean` ·
   `did not run: not authenticated` — which is a **positive signal about the
   run**, not an accusation against the code. Nothing exits non-zero and nothing
   refuses: a reviewer that could not run never blocks a render, a verdict or a
   commit.
7. **Empty by default, and the page says whose code went where.** `init` adds no
   reviewer. Configuring one sends the worktree's diff to a third party, which
   is a genuine change for a tool that currently touches nothing outside
   `.spec-env/` — so the config doc says so at the point of configuring, and
   every finding on the page is badged with the reviewer that produced it.
8. **Checks gain `source` and `line`.** Today a check is `{level, file, note}`,
   which was enough when the only author was the written review. With two
   possible authors a reader must be able to tell them apart, and a machine
   finding that cannot point at a line is most of its value thrown away.
9. **Severity maps to `flag`/`confirm` and never to `good`.** `error` → `flag`,
   everything else → `confirm`. `good` means "I read this and it is right",
   which is a thing a person says.
10. **A written review and a machine run compose.** `--review <json>` and
    `--run-reviewers` both contribute checks to the same list rather than one
    replacing the other, so "Claude's read plus CodeRabbit's" is one page.

## Solution overview

A new engine module, `env/reviewers.js`, owns the whole seam:

```
runReviewers(config, { worktree, base, scope, now })
  → { checks: [...], outcomes: [{ name, state, detail, count }] }
```

Each configured entry is spawned with `cwd` set to the spec's worktree, a
timeout, and no shell inheritance of the render's own state. `stdout` is parsed
by the entry's `format` (`rdjsonl`, or a bundled adapter's own parser) into
checks; `stderr`, the exit code and the timeout decide the `outcome`.

Config, alongside the existing `review.*` keys:

```json
"review": {
  "reviewers": [
    { "use": "coderabbit" },
    { "name": "semgrep", "command": "semgrep --rdjsonl ${scope}", "format": "rdjsonl", "timeout": 120 }
  ]
}
```

Substitutions available to a `command`: `${scope}` (`working` | `branch`),
`${base}`, `${spec}`, `${worktree}`. The two scopes match the render's own two
modes — a phase-end render is `working` (uncommitted + untracked in the
worktree), and `--branch` is the whole spec against its base.

Findings are cached in `.spec-env/reviews/<spec>.checks.json` (gitignored,
beside the notes, pending and gate sidecars), keyed by a hash of the diff the
render collected. A render whose diff hash matches reuses them and records the
outcome as `cached`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `review.reviewers[]` — `{use}` or `{name, command, format, timeout}` |
| CLI flag | add | `spec-env review <spec> --run-reviewers` |
| Skill flag | add | `/spec-diff --reviewers` |
| Engine module | add | `packages/common/src/env/reviewers.js` — runner, rdjsonl parser, outcomes |
| Adapter | add | `packages/common/src/env/reviewers/coderabbit.js` — `cr review --agent` stream |
| Sidecar | add | `.spec-env/reviews/<spec>.checks.json` — cached findings, keyed by diff hash |
| Domain object | update | a check gains `source` and `line` (was `{level, file, note}`) |
| Page template | update | `renderReviewBlock` — source badge, line anchor, reviewer-outcome strip |
| CLI | update | `spec-env review` merges `--review` checks with `--run-reviewers` checks |
| Skill | update | `/spec-next` — run reviewers after tests, before the render |
| Skill | update | `/spec-diff` — `--reviewers` on a mid-phase render |
| Rule / docs | update | `spec-planning.md`, `env.config.md`, `CLAUDE.md` — the seam and the privacy note |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The contract and the runner | ⬜ | [01-runner.md](01-runner.md) |
| 2 | Findings on the page | ⬜ | [02-page.md](02-page.md) |
| 3 | The CodeRabbit adapter | ⬜ | [03-coderabbit.md](03-coderabbit.md) |
| 4 | Skills, config docs, and the offer | ⬜ | [04-skills-docs.md](04-skills-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-17 | Ready | backlog | Reuben Greaves |
| 2026-09-17 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-17 — Spec created. Four design questions settled up front: reviewers
  fire at phase end and on demand; the run blocks the render but caches by diff
  hash; findings are checks and can never block a commit verdict; rdjsonl is the
  contract and CodeRabbit is the one bundled adapter.
