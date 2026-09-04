---
linear_identifier: "SKS-58"
linear_url: "https://linear.app/skitterbyte/issue/SKS-58/document-the-spec-env-and-spec-sync-cli-engines"
---

# Document the spec-env and spec-sync CLI engines

> **Type:** Feature
> **Name:** feat-cli-engine-docs (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-04)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** docs/index.html, docs/linear.html, scripts/docs-claims.test.js
> **Stack:** worktree

## Problem

The docs site documents skills and commands and stops there. Beneath them sit two
CLI engines that do the actual work — **`spec-env`** (10 verbs: per-spec
worktrees, dev servers, the proxy, landing, teardown) and **`spec-sync`** (17
verbs: the whole Linear mirror). `index.html` never mentions `spec-env` at all;
`linear.html` covers only three `spec-sync` verbs (`doctor`, `credentials`,
`retarget`), each in a purpose-built section rather than as a reference.

So a user who wants to know what `spec-env prune` reaps, or what
`spec-sync released <range>` reports, has nowhere to look but the source. These
are useful commands, and they are invisible.

The gap is self-perpetuating: `scripts/docs-claims.test.js` checks that every
verb **named on the site** exists in the dispatch, but nothing checks the
reverse. An engine can grow a verb and the site will never know.

## Decisions

1. **Every verb is labelled by who runs it.** Most `spec-env` verbs
   (`up`, `down`, `integrate`, `hotfix land`, `dev`) are **planners the skills
   drive** — `/spec-go` runs `spec-env up` and executes the plan it prints. Only a
   handful (`prune`, `status`, `resolve`) are things a person types. The same
   split runs through `spec-sync`, where `push`/`apply`/`stamp`/`record`/`verify`
   are plumbing `/spec-push` drives. Rejected: a flat man-page reference — it
   would read as an instruction to run `spec-env up` by hand, which is precisely
   what `/spec-go` exists to do for you.

2. **`spec-env` on `index.html`, `spec-sync` on `linear.html`.** That is the
   packaging boundary: `spec-env` ships in the tracker-free base, `spec-sync` only
   in the Linear superset. Rejected: a third `cli.html` — it would split the
   isolation docs away from the skills that use them, and add a page to keep in
   sync.

3. **The existing three `spec-sync` sections stay as they are.** `doctor`,
   `credentials` and `retarget` already have narrative sections that explain
   *when* you reach for them. The reference lists them and links across rather
   than duplicating or replacing that prose.

4. **The guard runs in both directions, with an explicit allowlist.** Today's
   test catches a page naming a verb that does not exist. The new one also
   catches a verb the engine dispatches that the page never mentions — the
   failure that produced this spec. Some verbs are genuinely internal
   (`normalize`, `stage`, `record`, `init-config`), so the test carries a named
   `UNDOCUMENTED` set with a reason per entry: a new verb then fails the suite
   until someone either documents it or consciously adds it to that list.
   Rejected: asserting every verb must be documented — it would force plumbing
   onto the page and get silenced with a blanket skip.

## Solution overview

Two reference sections, same shape, one per page.

Each is a table of every verb in that engine, with a **Run by** column carrying
one of two values — `skill` (a skill executes it; you rarely type it) or `you` —
plus a one-line description. Below each table, a short **"the ones you'd actually
type"** block showing real invocations and their real output for the `you` verbs,
in the style the pages already use for `doctor`.

The guard grows a second direction. `scripts/docs-claims.test.js` gains:

```js
// Every verb the engine dispatches is either on the page or named here with a
// reason. A new verb fails the suite until someone decides which.
const UNDOCUMENTED = {
  'spec-sync': { normalize: 'internal — repairs a snapshot in place', … },
}
```

so the site cannot silently fall behind an engine again.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Docs | add | `index.html` — `spec-env` reference (10 verbs) |
| Docs | add | `linear.html` — `spec-sync` reference (17 verbs) |
| Test | add | docs-claims: every dispatched verb is documented or allowlisted |
| Test | update | docs-claims: extend the name check to `spec-env` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `spec-env` reference on index.html | 🔄 | [01-spec-env-reference.md](01-spec-env-reference.md) |
| 2 | `spec-sync` reference on linear.html | ⬜ | [02-spec-sync-reference.md](02-spec-sync-reference.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | Ready | backlog | Reuben Greaves |
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-04 — Spec created.
