# Docs Freshness

The `docs/*.html` pages describe code, and code moves. Each page carries a
`<!-- coverage -->` block — `covers` globs naming the code it describes, and
`verified`, the commit someone last read it against — and
`scripts/docs-freshness.js` turns those into advisory reports. This file is the
repo-local convention; `docs/README.md` carries the block format and the
rationale.

## The `Docs:` header on specs

Every new spec records, in its header, which docs pages the change makes wrong:

```
> **Docs:** review, reference
> **Docs:** none: internal refactor, no reader-visible behaviour
```

- The value is a comma-separated list of page names (without `.html`), or
  `none: <one-line reason>`. **A bare `none` does not count** — the reason is
  what a reviewer can argue with; silence is an oversight. (Same grammar and
  same logic as the `Gating:` header.)
- Updating a named page is a normal task in the spec's phases, done in the same
  commit as the code it describes — and that commit bumps the page's
  `verified:` to its own HEAD.
- `node scripts/docs-freshness.js check` lists active specs
  (`specs/backlog/`, `specs/in-progress/`) with no usable answer. It is
  advisory and always exits 0; specs finished before this convention existed
  are out of range by construction.

## The two reports

- **`node scripts/docs-freshness.js impact [base]`** — run at spec completion
  (before `/spec-complete`): pages whose covered code this branch changed
  without the page being edited. Its output belongs in the completion report's
  `Notes` row.
- **`node scripts/docs-freshness.js stale`** — printed by `scripts/release.js`
  with every release plan: pages with commits since their `verified`. Re-read a
  listed page, fix what moved, bump its `verified:`.

Both always exit 0. A hit means *re-read this page*, never *this page is
wrong* — and anything the tool cannot answer prints `cannot tell`, never
"fresh".

## What none of this checks

Nothing verifies a page is correct, or that `covers` lists everything the
concept depends on — those are review questions. A recorded `Docs:` answer and
a quiet `stale` mean someone looked, not that the page is right. When code and
an old spec disagree, the page describes the code. The one blocking check is in
`scripts/docs-freshness.test.js`: a malformed coverage block or a `covers` glob
matching no tracked file fails the build, because a dead glob silences both
reports for that page for good.
