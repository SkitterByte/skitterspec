# Phase 4 — Publish skittership (GitHub + npm) ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

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

- [ ] Add a `LICENSE` file to skittership (MIT, matching `package.json` `license`)
      and confirm `package.json` metadata: `name` `@skitterbyte/skittership`,
      `version` `1.0.0`, `bin`, `files ["bin","src","assets"]`, `engines`,
      `repository` URL, `description`, `keywords`.
- [ ] Verify the publish artifact with `npm pack --dry-run`: exactly `bin/`,
      `src/`, `assets/`, `package.json`, `README.md`, `LICENSE` are included —
      **no** `test/`, `node_modules/`, or scratch files. Confirm the `bin` is
      executable and `npx .` resolves the CLI.
- [ ] Create the GitHub repo `SkitterByte/skittership` (public), add it as
      `origin`, and push the committed default branch.
- [ ] Prepare the release: tag `v1.0.0` locally (pushed with the branch) and write
      the exact publish command for the operator:
      `npm publish --access public` (with `--otp=…` if 2FA is on). Print
      `npm whoami` guidance so they publish under the right account.
- [ ] **Operator step (out of band):** run the handed-over `npm publish` command.
- [ ] Verify after publish: `npm view @skitterbyte/skittership version` returns
      `1.0.0` and `npx @skitterbyte/skittership@1.0.0 --help` works. (Record the
      result; this unblocks Phase 5's devDependency.)
- [ ] Run skittership's test command once more — `node --test` green — before
      handing over.

## Notes

- No skitterspec code changes here; this phase is entirely about the skittership
  repo + registry. Phase 5 (dogfood) consumes the result.
- If the operator defers publish, Phase 5 falls back to a `file:../skittership`
  devDependency — the GitHub push and pack-verify still stand.
