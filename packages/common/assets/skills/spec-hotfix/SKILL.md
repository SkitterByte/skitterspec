---
name: spec-hotfix
description: Fix a production bug on the exact released version — fork a worktree from a release tag, drive it red→green like /spec-bug, then land it by tagging a new patch (for CI/CD to deploy) and cherry-picking the fix back onto main. ALWAYS starts from a base tag and works on the hotfix's own branch, never on main. Creates specs/in-progress/hotfix-<name>/00-overview.md. Use when the user says "/spec-hotfix", "hotfix <tag>", "prod is broken on <version>", "patch the released version", or needs a fix shipped against a tagged release rather than main.
---

# /spec-hotfix — fix a released version, tag it, cherry-pick back to main

This is the **hotfix** counterpart to `/spec-bug`. Same test-first discipline
(reproduce as a **failing test (RED)**, then drive to **GREEN**), but the base is
a **release tag**, not `main`: prod is running a tagged version, so the fix must
be built on **that** commit line, shipped as a **new patch tag** (your CI/CD
deploys tags), and only then cherry-picked onto `main` for the next release.

Spec type convention (see `.claude/rules/spec-planning.md`):
- Hotfix specs are named `hotfix-<kebab-name>`; every header carries
  `> **Type:** Hotfix` and `> **Base version:** <tag>`.
- Branch is `hotfix/<slug>`, forked from the base tag.

**Isolation is required.** A hotfix forks a worktree from a tag and lands by
tag + cherry-pick — it needs the isolation engine (`specs/.core/env.config.json`).
If isolation is absent, say so and stop; there is no in-place path.

## 1. Establish the base version (the tag)

- Take the release tag from the argument — `/spec-hotfix <tag> <name>` (e.g.
  `/spec-hotfix v33.16.4 login-crash`). If it's missing, **ask which version prod
  is running** — don't guess.
- **Verify the tag exists** before anything else:
  `git rev-parse --verify <tag>^{commit}`. If it doesn't resolve, stop and ask.

## 2. Reproduce & isolate (light investigation)

Hotfixes are concrete — confirm, don't over-grill. Establish:

- **Repro:** exact steps / input that triggers it on the released version.
- **Expected vs actual:** what *should* happen vs what does.
- **Root cause:** read the code **at the base tag** and trace it to `file:line`.
  The fix belongs on the tag's line, so reason about that code, not `main`'s.

## 3. Seed the stub, then provision the worktree from the tag

The engine forks the worktree from the spec's `Base version`, so the stub — with
that header — must exist **before** `spec-env up`:

- From the base branch (`main`), create
  `specs/in-progress/hotfix-<name>/00-overview.md` with the header block
  (including `> **Type:** Hotfix` and `> **Base version:** <tag>`) and the
  `## Symptom` you established. It starts in `in-progress` — work begins now.
- Run `skitterspec spec-env up hotfix-<name>`. It prints a `git worktree add …
  -b hotfix/<slug> <tag>` command (the branch forks from **the tag**, not
  `main`), the worktree path, the opener, and any `in the worktree, run:`
  bootstrap steps.
- Run the printed `git worktree add`. **The worktree is checked out at the tag,
  so your uncommitted stub doesn't travel with it** — move it across so `main`
  stays pristine:
  `mv specs/in-progress/hotfix-<name> <worktreePath>/specs/in-progress/`.
- **Bootstrap the worktree.** A fresh worktree has no installed dependencies and
  none of the repo's gitignored files (`.env`, local overrides). Run the printed
  `in the worktree, run:` steps (file seeding, then setup) in order, before
  anything else.
- **Trust the worktree for this session.** The engine wrote the printed
  `trusted:` root into `.claude/settings.local.json`, but it won't hot-reload now
  — run `/add-dir <trusted root>` before editing into the worktree, or the first
  edits will prompt.
- **Do everything below in the worktree**, on the `hotfix/<slug>` branch — the red
  test, the fix, and the rest of the spec. Act with absolute paths /
  `git -C <worktreePath>`, or open a fresh session rooted there. `main` changes
  only at `/spec-complete` (via cherry-pick, not merge).

## 4. Write the failing test FIRST (RED) — mandatory

Encode the **correct** (expected) behaviour as a test, then run it and confirm it
**fails for the right reason**, on the hotfix branch:

- Put it where the suite already covers that area. Reuse existing test helpers /
  factories; follow the project's test rules (see `.claude/rules/`). Never
  hardcode dates — compute them relative to now.
- Run it with the project's test command. Quote the red output. A test that
  passes before the fix proves nothing — keep refining until it genuinely
  captures the bug on this version.

## 5. Write the Hotfix spec

Flesh out `00-overview.md` in the worktree (you seeded the stub in §3). A hotfix
is usually a single-pass fix, so the `## Fix` block can live directly in
`00-overview.md`. Keep it lean:

```markdown
# Hotfix: <short title>

> **Type:** Hotfix
> **Status:** In Progress — fixing (red test added)
> **Author:** <git user.name — who reported/captured it>
> **Developer:** <git user.name — you, since you're fixing it now>
> **Base version:** <tag prod is running, e.g. v33.16.4>
> **Raised:** <YYYY-MM-DD (today)>
> **Area:** <files/modules>

## Symptom

<observed wrong behaviour on the released version + repro steps; paste any error>

## Root cause

<the actual cause, at `file:line` on the base tag. One paragraph — be specific.>

## Failing test (red)

<test name + path; what it asserts. How to run it. Paste the red failure line.>

## Fix

- [ ] <the minimal change that addresses the root cause, not the symptom>
- [ ] Failing test now passes (GREEN); run the project's typecheck and test
      commands — confirm no regressions.
- [ ] <any follow-up hardening, or "None">

## Landing

- [ ] Deploy tag (patch bump of the base version) created at `/spec-complete`
      and pushed **by you** to trigger CI/CD.
- [ ] Fix cherry-picked onto `main` (and any `--also` release lines).

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| <YYYY-MM-DD> | In Progress | in-progress | <developer> |

## Changelog

- <YYYY-MM-DD> — Hotfix reproduced on <tag>; failing test added (red).
```

Keep the **State log** (state transitions) separate from the **Changelog** (fix
narrative and decisions).

## 6. Drive to GREEN

- Implement the **minimal, root-cause** fix on the branch. Match surrounding code;
  honour all project rules (see `.claude/rules/`).
- Re-run the failing test → it must pass. Then run the project's typecheck and
  test commands to confirm no regressions. Quote results.
- Commit the fix to the `hotfix/<slug>` branch (this commit is what gets tagged
  and cherry-picked). Tick the Fix tasks; add a Changelog line.

## 7. Report

Summarise: the base tag, root cause, the failing→passing test, the fix, and the
full test result. The spec stays in `in-progress`.

- **`/spec-live` is refused for a hotfix** — its branch is built on an old tag, so
  hot-reloading it onto the running dev server could break the shared instance.
  To test it, use `/spec-connect` (its own isolated stack).
- Suggest **`/spec-complete`** to land it: it patch-bumps the base tag, tags the
  hotfix branch **locally** (you push it to deploy), and cherry-picks the fix onto
  `main`. Add `--also <tag>` at completion to also patch other release lines
  (test/demo on their own versions).

Do **not** `git push` or `git tag`-and-push unless the user asks — deploying to
prod is theirs to trigger.
