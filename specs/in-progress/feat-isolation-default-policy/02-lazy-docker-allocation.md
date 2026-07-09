# Phase 2 — Lazy slot/port/.env: worktree-only skips them ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** A `worktree`-only spec provisions just the git worktree — no registry
slot, no `PORT_OFFSET`, no `.env`, no `docker compose`. Slots (and their port
block) are allocated only on the Docker path, so worktree-only specs never
consume the port space. Proven by tests over both stacks.

## Tasks

- [ ] In `planUp`, when `wantsDocker` is false: return a plan with `slot: null`,
      `portOffset: null`, `envContents: null`, and a `commands` array holding only
      the `git worktree add …` command. Preserve the attach-vs-fresh `-b` logic.
- [ ] Make slot allocation conditional in the CLI (`specEnvUp` in `src/cli.js`):
      only `readRegistry`/`allocateSlot`/`writeRegistry` and write `.env` when the
      spec's stack is `docker`; skip the registry entirely for worktree-only specs
      so they don't appear in `registry.json`.
- [ ] Ensure `specEnvDown` / `planDown` tolerate a spec with no slot (worktree-only
      teardown = remove the worktree, no `docker compose down`, no slot to free,
      no volumes to back up). Add a guard so freeing a non-existent slot is a no-op.
- [ ] Add/extend tests: `planUp` for a `worktree` spec yields no slot/portOffset/
      env and a single git command; a `docker` spec still allocates a slot and
      emits the compose command; `planDown` on a worktree-only spec plans only the
      worktree removal. Run `npm test` + typecheck — green before done.

## Notes

- The registry stays keyed by spec **folder name** (unchanged). Worktree-only
  specs simply never get a key — escalating one to Docker later (via `/spec-env`)
  allocates the slot at that point.
