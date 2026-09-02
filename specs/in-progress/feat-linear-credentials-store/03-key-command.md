# Phase 3 — Delegate to a password manager via keyCommand ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** users with 1Password, `pass` or the OS keychain can have skitterspec
store no secret at all.

## Tasks

- [x] Support `teams.<id>.keyCommand` in the store: run it, trim stdout, treat a
      non-zero exit or empty output as "no key" (the normal MCP fallback), and
      surface stderr on failure so a broken command is diagnosable.
- [x] Honour `keyCommand` **only** from the user-level store. Ignore it if it
      ever appears in the repo's `linear.config.json`, and say why — that file is
      committed, so honouring it would execute arbitrary code from a file a
      stranger wrote.
- [x] Add `credentials set --command <cmd>` to record one (a command is not a
      secret, so unlike `--key` it is safe in argv).
- [x] Report `source: command` in `status`, with the command shown and the
      resolved key still masked.
- [x] Document the pattern with worked examples for 1Password, `pass` and the
      macOS Keychain in `linear.config.md`.
- [x] Add tests: command output used as the key; non-zero exit falls back to
      MCP; **a `keyCommand` in the repo config is ignored, with a test that
      would fail if it were ever executed**; precedence of key over keyCommand.
- [x] Run `pnpm test` — green before the phase is done.

## Notes

Added during implementation: `set --command` **refuses a command with a Linear
key written into it**. Refusing `--key` makes `--command 'echo lin_api_…'` the
obvious workaround, and it is strictly worse — a command is not treated as a
secret, so `status` prints it back and it sits in the store in clear. Found by
a test asserting a failing command's stdout never reaches a diagnostic, which
failed because the command TEXT carried the key.

## Notes

The repo-config test is the important one and should be written so that
execution itself fails the test (e.g. a command that writes a sentinel file),
not merely that the key came out null.
