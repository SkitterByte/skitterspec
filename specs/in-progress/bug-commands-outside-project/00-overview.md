---
github_identifier: "#274"
github_url: "https://github.com/SkitterByte/skitterspec/issues/274"
---

# Bug: slash commands 404 when the session stands outside the project folder

> **Type:** Bug
> **Name:** bug-commands-outside-project
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/274
> **Author:** Reuben Greaves
> **Raised:** 2026-11-20
> **Area:** `packages/common/src/init.js` (command rendering), `assets/commands/*.md`
> **Docs:** none: `docs/index.html` names the commands but not how their line resolves the CLI; `packages/common/README.md` updated in the fix

## Symptom

The shipped commands that pre-execute an engine verb (`/spec-live`,
`/spec-connect`, `/spec-skip`, `/allow-main`, `/allow-project`, `/spec-epic`)
run `npx --no-install skitterspec …` (or `pnpm exec …`) in whatever directory
the session is standing in. In a repo whose npm project lives in a subfolder —
`spec-env resolve` prints `subfolder: FF.CSC.Solution/ (in repo C:\Code\LSC App)` —
a session at the git root or a worktree's root gets:

```
npm error 404 'skitterspec@*' is not in this registry.
```

Seen in practice: `/spec-live` failed after the agent had cd'd to a worktree's
root to commit a file outside the subfolder.

## Root cause

`renderExec` (`packages/common/src/init.js`) renders a command's `{{exec}}` as
the runner the lockfile picks. A runner resolves the install from the cwd, and
a command's `!` line runs in the session's cwd, not in the folder that holds
`.claude/commands/`. Outside the project folder there is no install, and
`--no-install` turns the failed lookup into the registry 404. A `--docs`
worktree, which has no install of its own, fails the same way from its root
whatever the layout.

## Failing test (red)

`packages/common/test/init-command-launcher.test.js` renders `spec-live`'s line
for a subfolder project (`LSC App/FF.CSC.Solution`, fake engine installed in the
subfolder) and runs it through the platform shell from four places: the
project folder (stays silent), the git root, a linked worktree's root, and with
no install anywhere. Run: `node --test packages/common/test/init-command-launcher.test.js`.

```
✔ stays silent: a cwd that has the install runs the engine there, as before
✖ from the git root, the command runs in the project subfolder
  npm error 404 The requested resource 'skitterspec@*' could not be found …
✖ from a worktree's root, the command runs in that worktree's project folder
✖ with no install anywhere, it refuses in one line naming the folder — never the registry 404
```

## Fix

- [x] On the local rung a command's `{{exec}} <bin>` renders as an inline
      `node -e` launcher (`renderCommand`): cwd walking up when the install is
      there → this checkout's toplevel + the prefix recorded at render time →
      the primary checkout's install, run in this checkout's project folder →
      one-line refusal, exit 1. It starts the engine's JS entry with
      `process.execPath`, so neither a `.bin` shim nor a shell is needed, and the
      line holds no `"` `$` `` ` `` `\` `%` `!`, so it survives `/bin/sh` and cmd.
      Skills keep the runner form (`renderExec`); the PATH and `npx -p` rungs are
      unchanged.
- [x] `managedTargets` and `copyAsset` render commands through `renderCommand`,
      so `init` writes the launcher and `update` rewrites a pristine runner-form
      file (tested); a customized one is kept, as for any managed file.
- [x] `spec-planning.md` (commands paragraph) and `packages/common/README.md`
      say where a command runs.
- [x] Failing test now passes (GREEN); full suite green (`pnpm test`).
- [x] Checked in a real headless Claude Code session (`claude -p "/spec-live status"`)
      from the subfolder and from the git root: the `allowed-tools` pattern
      matches the launcher line and the engine runs in the project folder.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `.claude/commands/*.md` `!` line + `allowed-tools`: `node -e "<launcher>" -- <verb>` on the local rung |
| Service | add | `renderCommand` (launcher-aware), `launcherPrefix` in `init.js` |
| Skill/rule | update | `spec-planning.md` — commands find the project themselves |

## Changelog

- 2026-11-20 — Bug reproduced; failing test added (red).
- 2026-11-20 — Fixed: commands render an inline `node -e` launcher that finds the project folder from any cwd; test green.
