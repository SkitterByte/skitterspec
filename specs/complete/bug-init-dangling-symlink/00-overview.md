---
linear_project_id: "0d24df5c-e999-4474-992a-f721972000d7"
linear_identifier: "SKI-init-symlink"
linear_url: "https://linear.app/skitterspec/project/bug-init-crashes-on-a-dangling-symlink-target-14858dcdb93d"
spec_status: "complete"
last_synced_at: "2026-07-31T14:20:26.629Z"
priority: 0
---

# Bug: init crashes on a dangling symlink target

> **Type:** Bug
> **Status:** Complete (2026-07-31)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-31
> **Area:** packages/common/src/init.js

## Symptom

`npx @skitterbyte/skitterspec-linear init` crashes when a file it wants to write
is a **dangling symlink** (a symlink whose target no longer exists):

```
skitterspec-linear: ENOENT: no such file or directory, open
'.../.claude/rules/spec-planning.md'
```

Reproduced live: `.claude/rules/spec-planning.md` was a symlink to a pre-monorepo
`assets/rules/` path that no longer exists.

## Root cause

`packages/common/src/init.js` → `writeFile` (line 72) guards with
`fs.existsSync(target)`, which **follows** the symlink and returns `false` for a
dangling one — so init treats the path as brand-new and calls
`fs.writeFileSync(target, content)`. That call also follows the dead link and
tries to open its missing target (whose parent dir doesn't exist) → **ENOENT**.
Regular files and valid symlinks work; only a *dangling* symlink target hits it.

## Failing test (red)

`packages/common/test/init.test.js` → "replaces a dangling symlink target instead
of crashing (ENOENT)": pre-creates a dangling symlink at
`.claude/rules/spec-planning.md`, runs `init`, and asserts it does **not** throw
and leaves a real file with the bundled rule content. Run:
`node --test --test-name-pattern="dangling symlink" packages/common/test/init.test.js`
— failed with the exact `ENOENT … open '.../spec-planning.md'` before the fix.

## Fix

- [x] `writeFile`: before the existsSync check, `fs.lstatSync(target)` to detect a
      symlink; if it's a symlink that does **not** resolve (dangling),
      `fs.unlinkSync(target)` and fall through to write a fresh real file. Regular
      files and valid symlinks keep their existing code path.
- [x] Failing test passes (GREEN); rebuilt the vendored dists; full suite 283
      green — no regressions.
- [x] Follow-up hardening: none needed — a valid symlink is left intact (only a
      broken one is replaced).

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-31 | In Progress | in-progress | Reuben Greaves |
| 2026-07-31 | Complete | complete | Reuben Greaves |

## Changelog

- 2026-07-31 — Bug reproduced live (`init` ENOENT on a dangling symlink); failing
  test added in init.test.js (red).
- 2026-07-31 — Fixed: `writeFile` replaces a dangling symlink with a real file;
  test green, suite 283/283.
- 2026-07-31 — Linked to Linear (dogfood) and completed; all Fix tasks done,
  bug test + suite green (283/283).
