# skitterspec

<!-- skitterspec:start -->
## Spec workflow

Spec-driven development runs through the lifecycle **skills**. The everyday
loop is **`spec → start → next → commit → complete`**. Use **`/spec-diff`** to
read what a phase changed, and `/spec-connect` or `/spec-live` to try it in a
browser. `/spec-resume` goes back into a spec that was waiting, and
`/spec-park` records what it is waiting on. `/spec-tada` and `/spec-todo` recap
the day and plan the next one across projects.

- **Each phase ends on a review page**, listed as `local`, `network` (LAN) and
  `remote` (tailnet), with a `live:` line saying whether it is also running.
  Mark it up and press a verdict. `/spec-next` waits for that press, and a phase
  that ended owes one before the next is built. A newly written spec's page
  offers `Commit & Start` (`commit-start`).
- **Every skill ends with the same report block**: a verdict, a table, and
  `Next`.
- **Guards**: work never happens in the primary checkout on the base branch,
  and a session works only on its own project. Only a person can lift either
  guard (`/allow-main`, `/allow-project`).

The rules are in `.claude/rules/spec-planning.md` (lifecycle and guards),
`.claude/rules/spec-reports.md` (the report block) and
`.claude/rules/spec-format.md` (spec layout, which loads under `specs/`). This
project's typecheck and test commands are in
`.claude/rules/project-conventions.md`.
<!-- skitterspec:end -->

## Docs freshness

The `docs/*.html` pages carry coverage blocks, specs carry a `> **Docs:**`
header (page names, or `none: <one-line reason>` — a bare `none` doesn't
count), and `node scripts/docs-freshness.js <check|impact|stale>` reports —
advisory, always exit 0 — which specs have no answer and which pages to re-read.
`impact` runs at every spec completion (it is this repo's `complete.checks`
entry); `stale` prints with every `scripts/release.js` plan; `verify <page>`
records a re-read by stamping the page. The full convention lives in `.claude/rules/docs-freshness.md`.

<!-- skittership:start -->
## Release tooling

This project uses **skittership** for commits, changelog, and user-facing release
notes. See `.claude/rules/commit-messages.md` for the full commit grammar.

- **Commit with `/commit`** — stages each file by name (`git add -- <path>`,
  never a directory), runs typecheck + the relevant tests, then writes a
  Conventional Commit (`type(scope): subject`) and commits it with that same
  pathspec. Concurrent sessions share one `.git/index`, so the pathspec is what
  bounds the commit.
- **`Release-Note:` footer** — add it to any user-visible commit (a plain-English,
  benefit-framed sentence). `Release-Note!:` promotes the note into the release
  Highlights; `Release-Area:` overrides the scope→area mapping; `Release-Note:
  none` marks a commit explicitly not user-facing.
- **Generation** — the dev-facing changelog (`CHANGELOG.md`) and the user-facing
  release notes (`RELEASES.md`) are regenerated from commits at `npm version`
  (when the hook is wired), or on demand via `npm run changelog` / `npm run
  releases`. Filenames, product name, and the scope→area map live in
  `skittership.config.json`. A monorepo that tags each package separately
  lists them under `packages` and runs
  `generate-releases.cjs --package <name>`; `--range <from>..<to>` on either
  generator names the commits outright. With a `release` key,
  `npm run release` plans a release and cuts it only with `--yes`; it pushes
  only with `--push`, one tag per push.
- **Upgrading** — `skittership update` re-syncs the managed files but keeps any
  you have edited, listing them as `customized — kept`; `--force` overwrites
  them. It tells the two apart using `.skittership-manifest.json`, a record of
  what it last wrote — **commit that file**, and do not add it to `.gitignore`.
  The tailoring this section invites is therefore safe to keep across upgrades.
  On the **first** upgrade to a version that records one there is no manifest
  yet, so everything is kept and little changes: save copies of any files you
  have edited, run `update --force` once to take the new files and seed the
  record, then re-apply your edits on top of the new files — never by restoring
  the old ones, which would discard the update.
<!-- skittership:end -->

> **In this monorepo**, the paragraph above describes skittership's default
> single-package flow. Here the `npm version` hook and the `changelog`/`releases`
> scripts are deliberately absent: `scripts/release.js` edits each package's
> `package.json` directly, so no `version` lifecycle hook fires, and the shipped
> generator walks one tag series where this repo has two. Release notes are
> written per package by `scripts/release-notes.js`, which `release.js` runs as
> part of a release — see [RELEASING.md](./RELEASING.md).
>
> **Nothing publishes from a laptop.** `release.js` bumps, commits and tags, and
> stops there — there is no `--publish`. Pushing the tag `<package>@<version>` is
> what releases: `.github/workflows/release.yml` stages that package on npm by
> OIDC with no token anywhere, and `npm run approve <package> <version>` finishes
> it with 2FA. CI being the only publisher is what makes every release carry a
> provenance attestation.
