# Trust the worktree root so provisioned specs stop prompting

> **Type:** Feature
> **Status:** In Progress — Phase 1 (started 2026-07-10)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-07-10
> **Area:** src/env/trust.js (new), src/cli.js, src/init.js,
> assets/skills/spec-env/SKILL.md, assets/skills/spec-go/SKILL.md, test/
> **Stack:** worktree

## Problem

Per-spec isolation provisions each worktree at `../{repo}-wt/{slug}` — **outside**
the primary working directory. Claude Code treats anything outside the working
dir as untrusted, so every `Edit`/`Write` into a freshly-provisioned worktree
prompts for permission. Today the only workaround is hand-granting each folder
one prompt at a time before work can start — a storm every adopter hits on every
new worktree. Nothing in the isolation setup ever registers the worktree root as
a trusted directory.

## Decisions

1. **Trust the worktree root via `permissions.additionalDirectories`.** That's
   the Claude Code knob that extends file access outside the working dir. One
   entry for the shared root (`../{repo}-wt`) covers every spec, since all
   worktrees are folders directly under it.
2. **Absolute path, written to `.claude/settings.local.json`.** Claude Code docs
   confirm `additionalDirectories` grants file access only and its documented
   examples are **absolute** paths — relative entries aren't reliable there
   (only `--add-dir`/`/add-dir` resolve relative, and those are per-session).
   Absolute paths are machine-specific, so they must live in the **gitignored**
   `settings.local.json`, never in committed config. Rejected: a committed
   `../{repo}-wt` in `.claude/settings.json` — not portable, unreliable.
3. **Idempotent merge, never a clobber.** A shared helper reads
   `settings.local.json`, ensures `permissions.additionalDirectories` contains
   the absolute root (exact-string dedup), and preserves every other key
   (including the `allow` array). Missing file → create it. Present but
   malformed JSON → warn and skip, never overwrite.
4. **Wire in two places sharing one helper.** `init.js installIsolation` seeds
   the entry when an adopter enables isolation (present at session start), and
   `cli.js specEnvUp` re-ensures it on every provision (self-heals for teammates
   who only clone and run `/spec-go` / `/spec-env`). `specEnvUp` already performs
   "the engine's only write" (the registry), so a settings write there is
   consistent.
5. **Cover the current session too, via `/add-dir`.** A mid-session write to
   `settings.local.json` likely doesn't hot-reload, so the very first provision
   would still prompt. The `/spec-env` and `/spec-go` skills therefore also
   instruct running `/add-dir <absolute worktree root>` — immediate effect for
   the live session — alongside the CLI's persistent write. Belt-and-suspenders:
   trusted now, permanent from next session.
6. **Teardown never removes the entry.** The root is shared across all specs and
   harmless when empty; removing it on `/spec-env-down` would just re-prompt on
   the next spec. `/spec-env-down` stays focused on stack/worktree/slot.
7. **Inert when isolation is off.** No settings change happens unless
   `specs/.core/env.config.json` is active — consistent with the rest of the
   isolation feature. `installIsolation` already no-ops when not enabled;
   `specEnvUp` only runs under the isolation engine.

## Solution overview

New pure-ish module `src/env/trust.js`:

```
ensureWorktreeDirTrusted(dir, worktreeRootAbs) -> { changed, reason }
  settingsPath = dir/.claude/settings.local.json
  if missing:            write { permissions: { additionalDirectories: [root] } }
  if malformed JSON:      return { changed:false, reason:'malformed' }  // + caller warns
  if root already listed: return { changed:false, reason:'present' }
  else:                   merge root into permissions.additionalDirectories, preserve rest
```

- Absolute root at provision time: `path.dirname(spec.worktreePath)` in
  `specEnvUp` (worktreePath is already `resolve(dir, worktreeRoot, {slug})`).
- Absolute root at init time: expand `env.config.json`'s `worktree.root` against
  `repoInfo(dir)` and `path.resolve(dir, …)` (reuse `resolve.js` helpers).
- Both callers surface a one-line report ("trusted: <root>" / "already trusted").
- Skills append: run `/add-dir <root>` for this session; note the persistent
  entry lives in `.claude/settings.local.json`.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Trust helper + unit tests | ✅ | [01-trust-helper.md](01-trust-helper.md) |
| 2 | Wire into provision + init + skills | ⬜ | [02-wire-and-skills.md](02-wire-and-skills.md) |

## Open questions

- [ ] None — `/add-dir` covers the current session regardless of whether
      `additionalDirectories` hot-reloads, so the reload behaviour need not be
      resolved.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-07-10 | Draft | backlog | Reuben Greaves |
| 2026-07-10 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-07-10 — Spec created. Design settled: absolute worktree root merged into
  gitignored `settings.local.json` by a shared helper, wired into both
  `installIsolation` and `specEnvUp`, with `/add-dir` covering the live session
  and teardown leaving the entry in place.
- 2026-07-10 — Phase 1 done: `src/env/trust.js` + `test/env-trust.test.js` (6
  cases, green; full suite 207 pass). No typecheck step — the repo is plain JS
  with only `npm test` (`node --test`), so tests are the sole gate for every
  phase here.
