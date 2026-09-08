# skitterspec

<!-- skitterspec:start -->
## Spec workflow

Spec-driven development runs through the lifecycle **skills** — use them so
structure and lifecycle stay consistent. The everyday loop is
**`spec → go → commit → complete`**, with `/spec-connect` when you want to test
the spec in a browser.

**Skills vs commands.** The lifecycle skills are read by Claude, which exercises
judgment. `/spec-connect` and `/spec-live` are **slash commands** instead — each
pre-executes one `spec-env` verb and relays it, so only you can run them; a
skill that wants one will tell you to type it.

The skill table, the spec type/folder conventions and the per-spec isolation
model all live in **`.claude/rules/spec-planning.md`**, the canonical reference
every spec skill points at. Tailor its per-phase test commands to this stack.
<!-- skitterspec:end -->

<!-- skittership:start -->
## Release tooling

This project uses **skittership** for commits, changelog, and user-facing release
notes. See `.claude/rules/commit-messages.md` for the full commit grammar.

- **Commit with `/commit`** — stages task-related files, runs typecheck + the
  relevant tests, then writes a Conventional Commit (`type(scope): subject`).
- **`Release-Note:` footer** — add it to any user-visible commit (a plain-English,
  benefit-framed sentence). `Release-Note!:` promotes the note into the release
  Highlights; `Release-Area:` overrides the scope→area mapping; `Release-Note:
  none` marks a commit explicitly not user-facing.
- **Generation** — the dev-facing changelog (`CHANGELOG.md`) and the user-facing
  release notes (`RELEASES.md`) are regenerated from commits at `npm version`
  (when the hook is wired), or on demand via `npm run changelog` / `npm run
  releases`. Filenames, product name, and the scope→area map live in
  `skittership.config.json`.
<!-- skittership:end -->

> **In this monorepo**, the paragraph above describes skittership's default
> single-package flow. Here the `npm version` hook and the `changelog`/`releases`
> scripts are deliberately absent: `scripts/release.js` edits each package's
> `package.json` directly, so no `version` lifecycle hook fires, and the shipped
> generator walks one tag series where this repo has two. Release notes are
> written per package by `scripts/release-notes.js`, which `release.js` runs as
> part of a release — see [RELEASING.md](./RELEASING.md).
