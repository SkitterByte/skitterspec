# Phase 1 — Trust helper + unit tests ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** A standalone `src/env/trust.js` that idempotently registers an
absolute directory in `.claude/settings.local.json` →
`permissions.additionalDirectories`, fully unit-tested over a tmp dir. Shippable
on its own (utility exists, no callers yet).

## Tasks

- [ ] Add `src/env/trust.js` exporting `ensureWorktreeDirTrusted(dir, rootAbs)`:
      resolve `dir/.claude/settings.local.json`; create parent `.claude/` if
      needed; JSON round-trip preserving all existing keys; ensure
      `permissions.additionalDirectories` is an array containing `rootAbs`
      (exact-string dedup); return `{ changed, reason }` where reason ∈
      `created | added | present | malformed`.
- [ ] Missing file → create `{ permissions: { additionalDirectories: [rootAbs] } }`
      with a trailing newline (match repo JSON style, 2-space indent).
- [ ] Present + valid → merge without touching other keys (esp. `permissions.allow`);
      no write when `rootAbs` already listed (`reason: 'present'`, `changed: false`).
- [ ] Malformed JSON → do **not** write; return `{ changed:false, reason:'malformed' }`
      so the caller can warn.
- [ ] Handle a present file lacking `permissions` or `additionalDirectories` by
      creating those keys without dropping siblings.
- [ ] Add `test/env-trust.test.js` (`node --test`, tmp dir per case) covering:
      create-new, merge-preserving-allow, dedup-idempotent (second call no-ops),
      malformed-skip, missing-permissions-key. Run typecheck + `npm test` — green
      before the phase is done (see `.claude/rules/spec-planning.md`).

## Notes

Keep the module pure of git/docker side effects (fs only), mirroring the
resolve/planner split — easy to unit-test with fixtures. Reuse the repo's
existing JSON read/write conventions (look at how `init.js writeConfig` /
registry writes format output).
