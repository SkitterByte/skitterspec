# Phase 1 — The store and the resolution chain (read side) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** the engine finds a key in a user-level store when the environment has
none, with the env var still winning and an over-permissive file refused.

## Tasks

- [ ] Add `packages/linear/src/credentials.js`: `storePath(env)` resolving
      `$XDG_CONFIG_HOME/skitterspec/credentials.json` then `~/.config/…`, and
      `readStore(path)` returning `{ ok, store }` / `{ ok: false, reason }` —
      never a throw, matching `resolveApiKey`'s existing contract.
- [ ] Refuse a group- or world-readable store: return the reason and the exact
      `chmod 600 <path>` to run. Do not read it, and do not silently fix it.
- [ ] Extend `resolveApiKey(config, env)` to fall through to the store, keyed by
      `config.linear.teamId`. Keep the env var first so CI is untouched.
- [ ] Report the source (`env` | `store`) on the resolved result, so `status`
      and diagnostics can say where a key came from without printing it.
- [ ] Extend the no-key error to name the store and the `credentials set`
      command, not just the env var.
- [ ] Add `packages/linear/test/credentials.test.js`: env wins over store;
      store used when env is empty; missing file is the normal "use MCP" state;
      0644 file refused with the chmod named; unparseable file reports clearly;
      XDG override honoured. **Assert no test ever puts a key in an error
      message or a returned error object.**
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

Read side only — nothing writes the store yet, so this phase is safe to land
while the key still comes from the environment.
