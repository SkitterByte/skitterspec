---
linear_identifier: "SKS-266"
linear_url: "https://linear.app/skitterbyte/issue/SKS-266/bug-spec-env-up-reports-the-file-it-just-wrote-as-someone-elses"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: `spec-env up` reports the file it just wrote as someone else's

> **Type:** Bug
> **Name:** bug-up-accuses-its-own-write (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — fixed (test green)
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

It wrote that file itself, moments earlier, and then reported it as work
belonging to somebody else. Three tests in
`packages/common/test/cli-spec-env-up.test.js` fail as a result.

Found by the first CI run this repo has ever had — both matrix jobs red against
a suite that was green on the author's laptop.

## Root cause

Two causes, and the second is why the first survived.

**The ordering.** `specEnvUpWorktree` wrote before it read. The trust write
(`ensureWorktreeDirTrusted`, `packages/common/src/cli.js:582`) creates
`.claude/settings.local.json`, and the tree was read *after* it — so the file
appeared in `dirtyPaths` and was classified as not-this-spec's. The report
divides the uncommitted tree into this spec's paths and **the operator's**, and
"the operator's" can only mean work that was there before the command ran.

**The blind spot that hid it.** `init.js:484` annotates the file "(gitignored)",
which is an assumption about the host project's `.gitignore` — the test fixture
ignores only `/.spec-env/`. It nevertheless passed everywhere it was ever run,
because **git reads `~/.config/git/ignore` as its global excludes file with no
`core.excludesFile` setting required**, and this author's line 1 is a recursive
glob for `.claude/settings.local.json`. Git therefore never mentioned the file
on the one machine the suite ran on. The fixtures were inheriting a personal
ignore rule and nobody could see it.

`checkout` mode was never affected: it makes no trust write, and
`specEnvUpCheckout` reads the tree before anything else.

## Failing test (red)

`packages/common/test/cli-spec-env-up.test.js` —
**`up never reports the settings file it writes itself`**: asserts `up` did
write `.claude/settings.local.json` (so the test proves something), then that no
`left untouched` block names it. Run with
`node --test packages/common/test/cli-spec-env-up.test.js`.

Making the fixtures set `core.excludesFile` to `/dev/null` is what turns the
three pre-existing tests red on the author's machine too — the harness fix
*is* the reproduction:

```
✖ up never reports the settings file it writes itself
✖ worktree mode provisions beside another spec’s uncommitted work
✖ a tree that is only this spec’s says nothing about untouched paths
✖ a clean tree reports nothing untouched and provisions
ℹ pass 14   ℹ fail 4
```

## Fix

- [x] Read the tree **before** writing into it — hoist the status, `dirtyPaths`,
      fork-point and untracked reads above the trust write in
      `specEnvUpWorktree`, and comment what the ordering is protecting.
- [x] Give every fixture its own ignore rules (`isolateIgnores`), so the suite
      stops inheriting whatever the developer has in `~/.config/git/ignore`.
- [x] Add the stays-silent test naming the defect directly.
- [x] Bump the GitHub Actions pins, which the runner was warning about: 
      `actions/checkout` and `actions/setup-node` v4 → v7, `pnpm/action-setup`
      v4 → v6.
- [x] Failing tests now pass (GREEN); full suite green, no regressions.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-env up` (worktree mode) — reads the tree before it writes |
| CI workflow | update | `ci.yml`, `release.yml` — action majors |

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-15 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-15 — Bug reproduced; failing test added (red).
- 2026-09-15 — Fixed: `up` reads the tree before its own trust write; test green.
- 2026-09-15 — The harness inherited `~/.config/git/ignore`, which is why this
  was invisible until CI existed. Fixtures now set `core.excludesFile` so they
  decide their own ignore rules.
