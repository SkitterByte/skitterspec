---
github_identifier: "#315"
github_url: "https://github.com/SkitterByte/skitterspec/issues/315"
---

# Bug: spec-env resume #N does not resolve Azure Boards specs

> **Type:** Bug
> **Name:** bug-resume-azure-ref
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/315
> **Author:** Reuben Greaves
> **Raised:** 2026-11-25
> **Area:** `packages/common/src/env/resume.js` (`sameRef`)
> **Docs:** none: ref matching is internal to `spec-env resume`; no page describes its grammar

## Symptom

Reported from ereqs (skitterspec-azure-boards, global install, 2026-11-25).
`specs/in-progress/chore-ereqs-lsc-token-migration/00-overview.md` carries
`azure_identifier: "AB#1020"`:

- `skitterspec spec-env resume '#1020' --json` → `ok:false` "no spec named or linked to #1020"
- `skitterspec spec-env resume 1020 --json` → same
- `skitterspec spec-env resume 'AB#1020' --json` → `ok:true`

"Every `/spec-resume #N` … fails for every Boards-linked spec. All of them are
stamped `AB#…`." Workaround: pass the spec name or `AB#N`.

## Root cause

`sameRef` (`packages/common/src/env/resume.js:102`) strips only a leading `#`
before comparing, so it knows GitHub's `#N` and nothing else. Azure Boards
stamps `AB#N`, which normalises to `ab#1020` and never equals `1020`. It is the
only ref comparator `findTarget` uses, so `#N` fails for every Boards-linked spec.

## Failing test (red)

`packages/common/test/env-resume.test.js`, the test named "an Azure Boards ref (AB#N) is
found by #N, by bare N and by AB#N". Run it with
`node --test packages/common/test/env-resume.test.js`.

```
✖ an Azure Boards ref (AB#N) is found by #N, by bare N and by AB#N
  TypeError [Error]: Cannot read properties of undefined (reading 'folder')
```

Stays-silent companions: `#1021`/`1021`/`XY#1020`/`AB-1020` refuse against an
`AB#1020` spec, and a `KEY-N` ref still matches only itself.

## Fix

- [x] Read a ref as an optional `<letters>#` prefix plus its number, and match on
      the number when the prefixes agree or one side has no prefix
- [x] Failing test now passes (GREEN); `pnpm test` shows no regressions
- [x] None

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env resume <#N\|N\|AB#N>` resolves an `AB#N`-stamped spec |

## Changelog

- 2026-11-25 — Bug reproduced; failing test added (red).
- 2026-11-25 — Fixed: sameRef reads a tracker prefix and matches an unprefixed ref on its number; test green, 4595 pass.
