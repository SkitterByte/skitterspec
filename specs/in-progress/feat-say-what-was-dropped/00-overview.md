---
linear_identifier: "SKS-277"
linear_url: "https://linear.app/skitterbyte/issue/SKS-277/say-what-was-dropped"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Say what was dropped

> **Type:** Feature
> **Name:** feat-say-what-was-dropped (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 1 (started 2026-09-16)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-16
> **Area:** packages/common/src/init.js, packages/common/src/env/config.js, packages/common/src/cli.js, MIGRATION.md
> **Stack:** worktree

## Problem

Three places where skitterspec knows something and does not say it — and one of
them makes a false claim instead.

1. **`update` reports an adopted path as your edit.** `managedState`
   (`init.js:277`) classifies a file that exists, differs from the bundled
   asset, and has no manifest entry as `customized` — reported as
   `your edit — kept`. When upstream *newly adopts* a path a project already
   has a file at, that is untrue: it was never our edit of their file, it was
   our file at a path they had not claimed. The v21 hook rename makes this
   concrete — `.cjs` is the obvious workaround for v20's ESM crash, so a
   project that wrote its own `review-gate.cjs` upgrades to v21 and gets the
   shim kept, the real hook never installed, and `review-gate.js` pruned out
   from under it. The shim fails open, so the gate is silently absent and the
   update reported success.
2. **`spec-env` drops unknown `env.config.json` keys in silence**
   (`env/config.js`, "Only known keys are copied"). A mis-typed
   `review.required` leaves the gate on, a mis-typed
   `teardown.deleteRemoteBranch` reverts to `prompt`, and the only signal is
   that nothing happened. v19's own notes name this cost for the retired `open`
   key — a known blind spot documented in prose, which is the shape
   `.claude/rules/negative-checks.md` says prose alone fails to prevent.
3. **`--help` omits two live verbs.** The `HELP` string (`cli.js:136`) lists
   ten `spec-env` subcommands; `live` and `stage` are absent, though both work,
   both appear in the dispatcher's own usage string (`cli.js:3585`), and `live`
   has a shipped `/spec-live` command. An undocumented verb reads as removed.

## Decisions

1. **A fourth `managedState`, not a changed default.** `adopted` joins
   `missing` · `pristine` · `customized`. The file is still **kept** — keeping
   is correctly the harmless branch (negative-checks rule 4), and that does not
   change. The bug is that two distinguishable cases share one label, so only
   the label splits. Rejected: writing upstream's copy beside it as
   `<path>.new` — it drops an untracked file into `.claude/` that nothing later
   cleans up, and `--diff` already shows what was declined.
2. **`adopted` requires a positive signal that the lookup could have seen the
   path.** `readManifest` collapses *missing* and *malformed* into the same
   empty baseline, so "not in the manifest" is meaningless on a repo that has
   no manifest yet — where **every** path is absent. `adopted` is concluded
   only when the manifest parsed and holds at least one entry; every
   cannot-tell falls back to `customized`, which keeps the file either way
   (negative-checks rules 1 and 4).
3. **The signal is one-shot, and the docs cover the cohort it cannot reach.**
   `flushManifest`'s migration seed writes the *bundled* hash for any present
   managed file with no entry, so an adopted path has an entry on the next run
   and classifies `customized` from then on. Anyone who already ran a v21
   `update` has spent the signal — so the `.cjs` trap is also written into
   MIGRATION.md's existing v20 → v21 section, where the affected reader is
   actually looking.
4. **The unknown-key advisory goes on the base `spec-env` chokepoint, on
   stderr.** Every subcommand funnels through one `loadEnvConfig` call
   (`cli.js:3512`), so one line there reaches every base user. Rejected:
   `spec-sync doctor` — it lives in `packages/linear/`, and `env.config.json`
   is a base concern, so routing it there leaves plain-skitterspec users blind.
   Rejected: `spec-env status` only — someone running `connect`/`live`/`review`
   daily and never `status` never sees it. **stderr**, because `--json` writes
   to stdout and an advisory must not corrupt it.
5. **Nested keys too.** `review.readr`, `docker.portbase`,
   `guards.refuseTeardownIfDirtyy`. That is where the typos that cost something
   live; top-level strays like the retired `open` are the cheap case.
   Out of scope: reporting a *known* key whose value was rejected for type or
   enum (`mode: "Checkout"`) — those already fall through to a documented
   conservative default, and each carries a comment saying so.
6. **The advisory never refuses.** It writes lines and exits 0, like
   `gating check`. An unknown key is forward-compat by design as well as a typo
   surface, and this spec is not changing which of the two it is.
7. **The help fix is a drift guard, not two lines.** `live` and `stage` went
   missing independently of each other; a third will follow unless one list is
   the source. Export the verb list, drive the usage string from it, and assert
   `HELP` names every verb — and that `HELP` names no verb the dispatcher does
   not handle.

## Solution overview

- **`init.js`** — a `manifestPresent(dir)` helper answering the question
  `readManifest` throws away; `managedState` gains `adopted`;
  `resyncManagedFile` keeps it exactly as it keeps `customized` but records it
  in a new `report.adopted` bucket carrying the same `{relPath, added, removed,
  hunks}` shape, so `--diff` works unchanged; `printReport` and `checkSync`
  each gain one line. `--force` takes theirs, as it already does.
- **`env/config.js`** — a declared `KNOWN_KEYS` shape naming every key
  `mergeConfig` reads; `collectUnknownKeys(parsed)` walking it to dotted paths;
  `loadEnvConfig` returning `unknown` alongside `config` and `present`.
- **`cli.js`** — the dispatcher writes one advisory line per unknown key to
  stderr before dispatch; `HELP` gains `live` and `stage`; the verb list
  becomes one exported constant.

All code lives in `packages/common/`. `packages/skitterspec/src/` and
`packages/skitterspec-linear/src/` are gitignored build output — never edited
by hand.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI output | add | `update` / `update --check`: an `adopted upstream` line |
| CLI output | add | `spec-env <any>`: `unknown key "<path>" is ignored` on stderr |
| CLI help | update | `HELP` gains the `live` and `stage` subcommands |
| Module API | update | `loadEnvConfig` returns `unknown` alongside `config`, `present` |
| Module API | add | `managedState` returns a fourth state, `adopted` |
| Docs | update | MIGRATION.md v20 → v21: a self-written `review-gate.cjs` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | An adopted path is not your edit | ⬜ | [01-adopted-paths.md](01-adopted-paths.md) |
| 2 | An unknown config key says so | ⬜ | [02-unknown-config-keys.md](02-unknown-config-keys.md) |
| 3 | The help lists every verb, and stays that way | ⬜ | [03-help-verb-sync.md](03-help-verb-sync.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-16 | Ready | backlog | Reuben Greaves |
| 2026-09-16 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-16 — Spec created.
