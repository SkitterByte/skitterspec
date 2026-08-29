# Direct-API apply path for `/spec-push`

> **Type:** Feature
> **Name:** feat-direct-api-apply (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-08-29)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-08-29
> **Area:** packages/linear (new api.js, cli-sync, config, spec-push skill), packages/sync-core (push)
> **Stack:** worktree

## Problem

`/spec-push` makes the language model the HTTP transport. `spec-sync push` emits
a plan and does no network I/O; the skill then applies it by generating one
`save_issue` MCP call per object. An MCP tool call is *generated* token by token,
so every issue description is read off disk into context and then re-emitted
verbatim as output tokens. Throughput is bounded by model decode speed on the
full description text, not by Linear's API.

10.1.0 made this worse: the `verify` step reads each description back with
`get_issue`, so every description now crosses the model **twice** per push.

Measured from `ereqs` mirroring 250 completed specs: 3,462,320 description bytes
(median ~11.7 KB, largest ~44.9 KB), 121 issues linked over an extended session
at 1–4 specs per agent round, with 40–60 rounds estimated for the remaining 129.
Several descriptions exceeded the 30 KB Bash-output cap and had to be read in
slices *before* being re-emitted. A `fetch` loop over the same 250 files is a
couple of minutes' work. Steady-state single-spec pushes are tolerable over MCP;
first-time adoption on an established repo is not.

## Decisions

1. **`apply` owns the whole write half** — create/update, verify read-back,
   stamp, record. The saving only exists if descriptions never enter the model's
   context in either direction; leaving the `get_issue` read-back with the agent
   keeps half the cost. The skill shrinks to: check states → get plan → apply →
   report.
2. **The API path is the default when a key is present**, with `--via mcp` to
   force the old path (and `--via api` to demand the new one). A key present
   means the user configured one deliberately, and the plan is identical either
   way. `apply` always prints which transport it used — never silent.
3. **Credentials come from an environment variable only** — `LINEAR_API_KEY` by
   default, or the variable named by `linear.config.json` → `auth.keyEnv`. The
   config names the *variable*, never holds the key. Rejected: a secret file path
   (one more thing to leak and to gitignore) and OS keychain (platform-specific
   for no gain here).
4. **The transport contract is `mcp.js`'s existing `makeAdapter` interface.**
   `api.js` implements the same typed operations against
   `https://api.linear.app/graphql`, so `apply` is written once against an
   adapter and is transport-agnostic. That abstraction currently has no consumer
   outside its own tests — this gives it one. Rejected: a parallel API-shaped
   apply loop, which would drift from the MCP one.
5. **Resumability comes from incremental stamping, not a new ledger.** `apply`
   stamps each id into the spec as soon as its object is created, so an interrupt
   leaves earlier objects linked; the next run's plan sees them as *updates*, not
   creates, and no duplicate is minted. Rejected: a separate ledger file (what
   the reporter hand-rolled) — the spec files already are the ledger, and a
   second one can disagree with them.
6. **Plain `fetch`, no new dependency.** Node ≥18 is already the engine floor and
   the surface is two mutations (`issueCreate`, `issueUpdate`) plus a few reads.
   The package keeps its single `prompts` dependency; a GraphQL client would earn
   nothing.
7. **Bulk (`--all <bucket>`) is phase 3**, after the single-spec path is proven.
   It is the reporter's actual use case, so it is in this spec rather than
   deferred to another.
8. **MCP remains fully supported.** No key, or `--via mcp`, and today's behaviour
   is unchanged — including for users whose Linear access is only the OAuth their
   MCP session carries.

## Solution overview

```
skitterspec spec-sync push  <spec> --workspace-states <file> --json > plan.json
skitterspec spec-sync apply <spec> --plan plan.json [--via api|mcp] [--json]
```

`apply` resolves a transport, then walks the plan in the order the skill uses
today (spec issue → sub-issue creates → sub-issue updates), stamping as it goes.
When the transport is `api` it also fetches workspace states itself, so
`--workspace-states` becomes unnecessary on that path. It finishes by reading
each written description back, running the existing `verify` comparison, and
recording the snapshot — then prints the same `{ issue: {id, identifier, url},
subIssues: {...} }` map the agent assembles by hand today.

On `--via mcp` (or no key) `apply` cannot make the calls itself: it prints the
same plan and the instruction to apply it over MCP, and the skill follows today's
steps 4–5. The two paths converge on the same `stamp` + `record`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync apply <spec> --plan <file> [--via] [--all]` |
| Service | add | `packages/linear/src/api.js` — GraphQL adapter, `makeAdapter` shape |
| Config key | add | `auth.keyEnv` (names the env var; never the key) |
| Config key | add | `apply.transport` — optional default for `--via` |
| Skill/rule | update | `/spec-push` steps 3–5 collapse into one `apply` call |
| CLI command | update | `spec-sync verify` reused by `apply`, still standalone |

No repo-content behaviour changes: the plan, the projection, the snapshot format
and the one-way rule are all untouched. This is a transport, not a new sync.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | GraphQL adapter + credential resolution | ✅ | [01-api-adapter.md](01-api-adapter.md) |
| 2 | `spec-sync apply` for one spec, end to end | ✅ | [02-apply-command.md](02-apply-command.md) |
| 3 | Wire `/spec-push` to it, MCP preserved | ⬜ | [03-skill-wiring.md](03-skill-wiring.md) |
| 4 | Bulk `apply --all <bucket>` | ⬜ | [04-bulk-apply.md](04-bulk-apply.md) |

## Open questions

- [x] Resolved in phase 1: the personal API key goes in `Authorization` raw,
      with no `Bearer` prefix (confirmed against Linear's developer docs). The
      reporter's belief was correct.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-08-29 | Ready | backlog | Reuben Greaves |
| 2026-08-29 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-08-29 — Spec created from an `ereqs` handoff against 10.0.1. Confirmed
  against 10.1.0: no HTTP client, GraphQL, or credential handling anywhere in the
  distribution, and `SKILL.md` §3 states the engine does no network I/O.
- 2026-08-29 — Noted that 10.1.0's `verify` read-back doubled the cost the report
  measured; it is the right check, it just should not be the model's job.
- 2026-08-29 — Chose the existing `makeAdapter` interface as the transport
  contract after finding it has no consumer outside its own tests.
- 2026-08-29 — Phase 1 done. Confirmed the raw-key `Authorization` form against
  Linear's docs, closing the spec's only open question. Added `listIssueStates`
  beyond the MCP op set so the API path resolves workspace states itself; the
  contract test therefore asserts "no MCP op missing" rather than set equality.
  The API needs a state *id* where MCP took a *name*, so `stateIdFor` is the one
  extra hop the transport adds.
- 2026-08-29 — Phase 2 done. Extracted `verifyLines` from `spec-sync verify` so
  `apply` runs the same comparison rather than a second implementation that could
  disagree about what counts as lost text. Resumability is proven by a test that
  fails the second write, asserts the first object is stamped and the second is
  not, then re-runs and asserts only the missing object is created.
