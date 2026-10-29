---
github_identifier: "#70"
github_url: "https://github.com/SkitterByte/skitterspec/issues/70"
github_assignee_id: "SkitterByte"
github_assignee_name: "Reuben Greaves"
---

# Docs freshness — covers/verified on the docs pages

> **Type:** Feature
> **Name:** feat-docs-freshness (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** Complete (2026-10-29)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-10-29
> **Area:** scripts/, docs/, .claude/rules/, CLAUDE.md, RELEASING.md
> **Stack:** worktree
> **Docs:** none: the docs-page edits (coverage blocks, README note) are in-spec tasks

## Problem

`scripts/docs-claims.test.js` verifies the docs pages' *claims* — every named
verb and skill exists, no dead links — but `docs/README.md` admits the gap:
nothing can check "that the prose is still true", and nothing tells anyone
**when to re-read**. Code moves under a page and the page stays plausible-looking
and wrong until a reader notices. The README itself demonstrates it: it says
"four pages" and omits `azure-boards.html`. This spec gives git a way to say
"the code this page describes has changed since someone last read it".

Design source: a proven pattern from another project (covers/verified
frontmatter, a build-failing validator, a `Docs:` spec header, two advisory
git reports), adapted to this repo below.

## Decisions

1. **Repo-local tooling, not a product feature.** It applies to skitterspec's
   own `docs/` pages only; nothing ships in `packages/*`. Rejected: a
   config-gated feature mirroring gating — possible later, but unproven here
   first.
2. **Metadata lives in an HTML comment block** (`<!-- coverage … -->`) at the
   top of each `docs/*.html` — the pages are self-contained HTML with no
   frontmatter, and in-page metadata is visible at the moment someone edits the
   page. Rejected: a sidecar manifest, which is forgettable precisely then.
3. **`verified` is a commit SHA**, bumped to HEAD when someone re-reads the
   page. The paste used a release tag, but this monorepo has per-package tag
   series and pages span packages. An unknown ref (shallow clone) reports
   **cannot tell**, never fresh, and exits 0.
4. **This does not reopen the "no version notes" decision** in
   `docs/README.md`. That rejected *displayed* version claims, which rot
   visibly and helplessly. `verified` is machine-read input to the stale
   report — its aging is what makes the report fire. The README paragraph is
   updated to draw that distinction.
5. **One blocking check only: a dead `covers` glob fails the build.** A glob
   matching no file silences both reports for that page for good, so that case
   must break loudly. Everything else — `check`, `impact`, `stale` — is
   advisory and always exits 0: a hit means "re-read this page", not "this
   page is wrong".
6. **`stale` is wired into `scripts/release.js`** as an advisory print while
   cutting any package release (plus a RELEASING.md line). "Run it before
   tagging" by memory is the exact failure mode this design targets. It never
   blocks a release.
7. **The `Docs:` spec header is a local convention**, not a skill change: a
   new `.claude/rules/docs-freshness.md` plus a CLAUDE.md conventions line.
   Grammar mirrors gating: `> **Docs:** <page names>` or
   `> **Docs:** none: <one-line reason>` — a bare `none` doesn't count, the
   reason is what a reviewer can argue with. The `check` subcommand lists
   active specs with no answer, scanning `backlog/` and `in-progress/` only so
   pre-adoption specs are excluded structurally (same reasoning as
   `packages/common/src/gating.js`).
8. **Plain Node CommonJS, no dependencies** — `scripts/docs-freshness.js`,
   matching every sibling script. Rejected: the paste's tsx/TypeScript shape.
9. **Said plainly what isn't checked:** nothing verifies a page is correct or
   that `covers` is complete. A quiet `stale` means someone looked, not that
   the page is right. When code and an old spec disagree, the page describes
   the code.

## Solution overview

One script, `scripts/docs-freshness.js`, with three subcommands (all exit 0):

- **`check`** — list active specs (`backlog/`, `in-progress/`) whose header has
  no `Docs:` answer, or a bare `none`.
- **`impact [base]`** — pages whose `covers` this branch changed (merge-base
  diff + uncommitted + untracked) without the page itself being edited. Run at
  spec completion; output goes in the completion report's Notes.
- **`stale`** — pages with commits in `<verified>..HEAD` touching their
  `covers`. Run by `release.js`; a listed page is re-read, fixed if needed, and
  its `verified` bumped to the release's HEAD.

Each `docs/*.html` opens with:

```html
<!-- coverage
covers:
  - packages/common/src/env/review*
  - packages/skitterspec/skills/spec-diff/**
verified: 2716308e
-->
```

The build-failing validator (in the script's test file, run by `node --test`)
asserts every page has a well-formed block and every glob matches at least one
tracked file.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Script | add | `scripts/docs-freshness.js` (`check` · `impact` · `stale`) |
| Test | add | `scripts/docs-freshness.test.js` — unit tests + build-failing page validator |
| Docs pages | update | coverage block atop all 7 `docs/*.html` |
| Release flow | update | `scripts/release.js` prints the advisory stale report |
| Rules | add | `.claude/rules/docs-freshness.md` (`Docs:` header convention) |
| Docs | update | `docs/README.md` (watermark distinction), `RELEASING.md`, CLAUDE.md conventions |
| Spec header | add | `> **Docs:**` line on new specs (convention, checked advisorily) |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Script core — parser, check, impact, stale | ✅ | [01-script-core.md](01-script-core.md) |
| 2 | Coverage blocks on every page + validator | ✅ | [02-page-coverage.md](02-page-coverage.md) |
| 3 | Wiring — release.js, rules, docs | ✅ | [03-wiring.md](03-wiring.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-10-29 | Ready | backlog | Reuben Greaves |
| 2026-10-29 | In Progress | in-progress | Reuben Greaves |
| 2026-10-29 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-10-29 — Spec created.
- 2026-10-29 — Completed; all phases done, tests green (4,295).
