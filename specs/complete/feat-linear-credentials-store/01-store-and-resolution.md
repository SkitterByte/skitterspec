# Phase 1 — The store and the resolution chain (read side) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the engine finds a key in a user-level store when the environment has
none, with the env var still winning and an over-permissive file refused.

## Tasks

- [x] Add `packages/linear/src/credentials.js`: `storePath(env)` resolving
      `$XDG_CONFIG_HOME/skitterspec/credentials.json` then `~/.config/…`, and
      `readStore(path)` returning `{ ok, store }` / `{ ok: false, reason }` —
      never a throw, matching `resolveApiKey`'s existing contract.
- [x] Refuse a group- or world-readable store: return the reason and the exact
      `chmod 600 <path>` to run. Do not read it, and do not silently fix it.
- [x] Extend `resolveApiKey(config, env)` to fall through to the store, keyed by
      `config.linear.teamId`. Keep the env var first so CI is untouched.
- [x] Report the source (`env` | `store`) on the resolved result, so `status`
      and diagnostics can say where a key came from without printing it.
- [x] Extend the no-key error to name the store and the `credentials set`
      command, not just the env var.
- [x] Add `packages/linear/test/credentials.test.js`: env wins over store;
      store used when env is empty; missing file is the normal "use MCP" state;
      0644 file refused with the chmod named; unparseable file reports clearly;
      XDG override honoured. **Assert no test ever puts a key in an error
      message or a returned error object.**
- [x] Run `pnpm test` — green before the phase is done.

## Notes

Added during implementation: `resolveApiKey` **short-circuits before touching the
filesystem when no `teamId` is configured**. The store is keyed by team, so there
is nothing to look up — and without it every unit test using the default config
would read the developer's real `~/.config`, making the suite's result depend on
whose machine it ran on. Pinned by a test that fails if the store is touched at
all, and verified by planting a real store at this repo's own team id and
re-running the suite: 881 pass either way.

Read side only — nothing writes the store yet, so this phase is safe to land
while the key still comes from the environment.

The no-key error names the store **file** but not `credentials set`: that command
arrives in Phase 2, and a message sending users to a command that only prints
usage would break the "every phase is independently shippable" rule. Moved to a
Phase 2 task.
