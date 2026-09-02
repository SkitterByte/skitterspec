# Phase 3 — Delegate to a password manager via keyCommand ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** users with 1Password, `pass` or the OS keychain can have skitterspec
store no secret at all.

## Tasks

- [ ] Support `teams.<id>.keyCommand` in the store: run it, trim stdout, treat a
      non-zero exit or empty output as "no key" (the normal MCP fallback), and
      surface stderr on failure so a broken command is diagnosable.
- [ ] Honour `keyCommand` **only** from the user-level store. Ignore it if it
      ever appears in the repo's `linear.config.json`, and say why — that file is
      committed, so honouring it would execute arbitrary code from a file a
      stranger wrote.
- [ ] Add `credentials set --command <cmd>` to record one (a command is not a
      secret, so unlike `--key` it is safe in argv).
- [ ] Report `source: command` in `status`, with the command shown and the
      resolved key still masked.
- [ ] Document the pattern with worked examples for 1Password, `pass` and the
      macOS Keychain in `linear.config.md`.
- [ ] Add tests: command output used as the key; non-zero exit falls back to
      MCP; **a `keyCommand` in the repo config is ignored, with a test that
      would fail if it were ever executed**; precedence of key over keyCommand.
- [ ] Run `pnpm test` — green before the phase is done.

## Notes

The repo-config test is the important one and should be written so that
execution itself fails the test (e.g. a command that writes a sentinel file),
not merely that the key came out null.
