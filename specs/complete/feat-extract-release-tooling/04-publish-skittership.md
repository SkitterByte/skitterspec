# Phase 4 — Publish skittership (GitHub + npm) ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `@skitterbyte/skittership` is a real, installable package: its source is
on GitHub under SkitterByte, its publish artifact is verified, and the exact
`npm publish` command is ready for the operator to run — so Phase 5 can depend on
the published package.

## Decisions

- **Operator publishes.** `npm publish` is irreversible and needs the operator's
  npm auth/OTP, so this phase preps everything (pack dry-run, metadata, README)
  and hands over the exact command — it does **not** run publish itself.
- **GitHub repo created + pushed** to `SkitterByte/skittership` so the
  `package.json` `repository` URL resolves and npm links back to source.
- **Public scoped package** → publish needs `--access public` (scoped packages
  default to restricted).

## Tasks

- [x] Added `LICENSE` (MIT, 2026 Reuben Greaves) and confirmed `package.json`
      metadata: `@skitterbyte/skittership` v1.0.0, `bin`, `files
      ["bin","src","assets"]`, `engines node >=18`, repository URL. Committed
      locally in the skittership repo (`chore: add MIT LICENSE`).
- [x] Verified the publish artifact with `npm pack --dry-run`: 15 files, 18.6 kB —
      exactly `bin/`, `src/`, `assets/`, `package.json`, `README.md`, `LICENSE`;
      **no** `test/`/`node_modules`. Bin runs (`--version` → 1.0.0).
- [x] Repo `SkitterByte/skittership` created (in the GitHub UI by the operator);
      added `origin` (SSH), renamed the branch `master → main`, pushed `main`.
- [x] Tagged `v1.0.0` and pushed the tag. Publish command handed to the operator:
      `npm publish --access public` (add `--otp=…` if 2FA) from the skittership repo.
- [x] **Operator ran `npm publish`.** Landed after a short registry-propagation
      delay (an authed `npm view` 404'd at first, then resolved).
- [x] Verified: `npm view @skitterbyte/skittership version --prefer-online` →
      `1.0.0`; tarball published at registry.npmjs.org. Unblocks Phase 5.
- [x] Ran skittership's test command — `node --test` green (62) — before hand-off.

## Notes

- No skitterspec code changes here; this phase is entirely about the skittership
  repo + registry. Phase 5 (dogfood) consumes the result.
- If the operator defers publish, Phase 5 falls back to a `file:../skittership`
  devDependency — the GitHub push and pack-verify still stand.
