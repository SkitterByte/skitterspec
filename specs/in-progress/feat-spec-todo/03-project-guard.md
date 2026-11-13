---
github_issue_id: "#205"
---

# Phase 3 — The project guard and `/allow-project` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** a session cannot write into, or run lifecycle commands in, another
skitterspec project unless the operator lifts the guard for it. Proven by
engine tests and a hook test driving real payloads.

## Tasks

- [x] `env/project-guard.js`:
      - `projectOf(dir)` returns the git common dir and whether
        `specs/.core/` exists;
      - `checkPath(home, file)` and `checkCommand(home, cwd, command)` return
        `{ allow }` or `{ deny, project, reason }`, following Decision 7;
      - extract the effective directories from `cd`, `git -C` and `--dir`
        targets;
      - keep the read-only allow-lists for git and skitterspec verbs;
      - fail open on anything unparsable, with the blind spots named in
        comments.
- [x] `spec-env project <check|allow|status>`:
      - `check --path|--command --cwd --session` returns allow or deny;
      - `allow <name|path> --session <id> [off]` records the lift in
        `.spec-env/project-allow.json`;
      - `status` lists the lifts.
- [x] Honour `guards.projectBoundary: false`.
- [x] Add `assets/hooks/project-guard.cjs`, the same shape as
      `main-guard.cjs`. It reads the payload (`tool_name`, `tool_input`,
      `cwd`, `session_id`), defers to the engine, and refuses through the
      JSON route with a reason naming `/allow-project <name>`. It fails open.
- [x] `init`/`update`: install the hook and register it in
      `.claude/settings.json` on `Edit|Write|NotebookEdit|MultiEdit` and on
      `Bash`, beside the existing hooks.
- [x] Add `assets/commands/allow-project.md`, user-only
      (`disable-model-invocation`). It pre-executes `spec-env project allow`
      and relays the result.
- [x] Tests, covering the refusals and the cases that must stay allowed:
      - **Refused:** an `Edit` into another project; `cd <other> &&
        skitterspec spec-env down x`; `git -C <other> commit`.
      - **Allowed:** an edit in this repo's own worktree; a sibling folder
        with no `specs/.core`; `git -C <other> log`; `skitterspec tada`;
        an unparsable command; a lift for this session; and a lift for a
        different session that doesn't apply here.
      - The hook end to end with a fake engine.
      Run `pnpm test`, which must be green.
