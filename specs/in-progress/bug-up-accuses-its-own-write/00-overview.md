# Bug: `spec-env up` reports the file it just wrote as someone else's

> **Type:** Bug
> **Name:** bug-up-accuses-its-own-write (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixing (red test added)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-15
> **Area:** packages/common/src/cli.js, packages/common/test/cli-spec-env-up.test.js, .github/workflows/

## Symptom

On a clean tree, `spec-env up` prints a report about nothing:

```
  trusted:   /tmp/repr-wt  (added to .claude/settings.local.json)

  not this spec's — left untouched (1):
    .claude/settings.local.json
```

It wrote that file itself, moments earlier, and then reports it as work
belonging to someone else. Three tests in
`packages/common/test/cli-spec-env-up.test.js` fail as a result — but **only on
a machine where git reports the file**, which is why CI's first ever run was red
against a suite that is green on the author's laptop.
