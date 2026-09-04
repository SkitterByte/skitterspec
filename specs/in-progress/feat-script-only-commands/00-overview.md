---
linear_identifier: "SKS-46"
linear_url: "https://linear.app/skitterbyte/issue/SKS-46/script-only-commands-split-the-skill-catalogue-by-whether-the-model-is"
---

# Script-only commands — split the skill catalogue by whether the model is needed

> **Type:** Feature
> **Name:** feat-script-only-commands (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-04)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-04
> **Area:** packages/common/src/init.js, packages/common/src/env/resolve.js, packages/skitterspec/src/env/resolve.js, packages/skitterspec/src/env/registry.js, packages/skitterspec/src/cli.js, packages/common/assets/skills/, packages/common/assets/commands/, scripts/build-dist.js
> **Stack:** worktree

## Problem

Every skitterspec verb is a `SKILL.md`, so every invocation costs a full model
turn — even the ones that are only ever "resolve a name, call one CLI verb, relay
the output". `/spec-connect` and `/spec-live` are exactly that shape, yet each
costs exploration, a Bash round-trip, and a reply.

Two things drive the cost, and neither is the skill body:

1. **All 16 skill descriptions sit in the system prompt every session**, used or
   not. `spec-connect`'s description alone is ~90 words. That is a standing
   per-session tax for verbs that are one CLI call.
2. **Every engine skill opens by making the model find the spec.** They all carry
   the same paragraph — *"use the argument, else the spec in context, else ask"* —
   and they must, because `resolveSpec` (`packages/skitterspec/src/env/resolve.js:219`)
   throws unless handed an explicit name. There is no zero-arg path, so the model
   goes reading `specs/in-progress/` before it can run anything.

The result is that work the user could have done with `!pnpm exec skitterspec
spec-env connect foo` instead burns a full turn being clever about a lookup the
CLI should have answered itself.

## Decisions

1. **Zero-arg resolution reads the slot registry, not the spec buckets.**
   `.spec-env/registry.json` (`packages/skitterspec/src/env/registry.js`) maps spec
   name → slot and is the single source of truth for which specs have a
   provisioned environment. That is the **positive signal** every `spec-env` verb
   actually needs. Rejected: scanning `specs/in-progress/` — an absence there means
   nothing, because git does not store an empty directory (the folder is missing
   from this very repo), which is precisely the failure `negative-checks.md`
   documents.

2. **Ambiguity and emptiness both exit non-zero; neither guesses.** One registered
   spec → use it. Several → print a numbered list and exit non-zero. None → say no
   spec has a provisioned environment and point at `/spec-go`. The *cannot tell*
   case routes to inaction, never to picking a spec (`negative-checks.md` rule 4).

3. **Only `spec-connect` and `spec-live` become commands.** They are the only two
   that reduce to one verb plus a relay. Rejected: also moving `spec-status`
   (fetches the Linear issue over MCP, and branches on a team-key mismatch that
   sends the user to `spec-sync retarget`) and `spec-sync` (a 191-line manual over
   ten subcommands) — pre-executing a single command would destroy real behaviour.

4. **The remaining engine skills get `disable-model-invocation: true`, not a
   rewrite.** `spec-status`, `spec-sync` and `spec-to-main` stay full skills but
   leave the model-facing listing, so the standing description cost goes without
   losing the judgment they carry. All three are user-typed in practice, and
   `spec-to-main` is side-effecting (it lands a branch), which is the documented
   case for the flag.

5. **The package manager is detected at init and its prefix baked into the
   generated command files.** The CLI is never on `PATH` — it is a local
   devDependency reached via `pnpm exec skitterspec` (and `skitterspec-linear`
   aliases the same `skitterspec` bin). A pre-executed command must carry a literal
   working invocation. Command files therefore become **generated**, not copied
   verbatim; the install manifest already hashes written content, so switching
   package manager simply re-syncs. Rejected: hardcoding `npx` (slower, and against
   the project's pnpm convention) and shipping a repo-local shim (an extra tracked
   file in every consumer).

6. **Superseded skill files are retired only when they are provably ours.**
   Moving `spec-connect`/`spec-live` out of `.claude/skills/` leaves a stale
   `SKILL.md` in every existing install. `removeRetiredFiles` currently deletes
   unconditionally (`packages/common/src/init.js:258`), which was safe for generated
   index caches but is not safe for a file a user may have edited. Retirement must
   consult the manifest: hash matches something we wrote → delete; unrecognised →
   keep it and warn. Being wrong costs a redundant file, never the user's edit.

7. **Cross-references become instructions to the user, not model invocations.**
   `/spec-go`, `/spec-complete`, `/spec-hotfix` and `/spec-to-main` mention
   `/spec-connect` and `/spec-live`, but every occurrence points the *user* at them
   rather than calling them, so `disable-model-invocation` breaks nothing. Verified
   at spec time; re-checked as a task.

## Solution overview

Three independent pieces, landing in dependency order.

**Zero-arg resolution** — `resolveSpec` gains a path for a missing `specArg`:
consult the registry, return the sole entry, or throw a listing error. Every
`spec-env` subcommand inherits it through `resolveSpecWithWorktree`
(`packages/skitterspec/src/cli.js:495`), so the "find the spec" paragraph stops
being the model's job for *all* skills, not just the two being moved.

**A `commands/` lane in the installer** — `init.js` discovers
`assets/commands/*.md` the same way `listSkills()` discovers skills, installs them
to `.claude/commands/`, and covers them in `managedTargets` so the manifest,
`--force` resync and customization detection all apply unchanged. Command bodies
carry a `{{exec}}` token replaced at write time with the detected prefix.
`composeAssets` already copies the whole assets tree, so both distributions pick
the new directory up with no build change; the Linear overlay gets a matching
`commands` line so a future provider command is not silently dropped.

**The move** — `spec-connect` and `spec-live` become command files whose body
pre-executes the verb:

```markdown
---
description: Point the canonical ports at a spec's dev servers
allowed-tools: Bash({{exec}} skitterspec spec-env:*)
disable-model-invocation: true
---
!`{{exec}} skitterspec spec-env connect $ARGUMENTS`

Relay the output above. Nothing else.
```

The script runs at expansion, before the model sees anything; the model's only
job is to relay. Their old `SKILL.md` files are retired manifest-aware.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI | update | `spec-env <verb>` accepts no spec arg — resolves via registry |
| CLI | add | ambiguity/empty listing errors, exit non-zero |
| Installer | add | `.claude/commands/` lane + `listCommands()` + `{{exec}}` interpolation |
| Installer | add | package-manager detection from lockfile |
| Installer | update | `removeRetiredFiles` becomes manifest-aware |
| Skill/rule | remove | `.claude/skills/spec-connect/`, `.claude/skills/spec-live/` |
| Skill/rule | add | `.claude/commands/spec-connect.md`, `.claude/commands/spec-live.md` |
| Skill/rule | update | `disable-model-invocation` on spec-status, spec-sync, spec-to-main |
| Skill/rule | update | `spec-planning.md` skill table — commands vs skills |
| Config | add | manifest covers `.claude/commands/*.md` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Zero-arg spec resolution from the registry | ⬜ | [01-zero-arg-resolution.md](01-zero-arg-resolution.md) |
| 2 | A `commands/` lane in the installer | ⬜ | [02-commands-lane.md](02-commands-lane.md) |
| 3 | Move spec-connect and spec-live to commands | ⬜ | [03-move-engine-verbs.md](03-move-engine-verbs.md) |
| 4 | Take the remaining engine skills out of the listing | ⬜ | [04-disable-model-invocation.md](04-disable-model-invocation.md) |

## Open questions

- [ ] None — the one unknown (whether `$ARGUMENTS` interpolates inside a
      `` !`…` `` block) is a verification task at the head of Phase 2, with a
      documented fallback in that phase's notes.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-04 | Ready | backlog | Reuben Greaves |
| 2026-09-04 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-04 — Spec created.
- 2026-09-04 — Narrowed scope from four engine verbs to two: reading
  `spec-status` and `spec-sync` end-to-end showed both carry real branching (MCP
  fetch + team-key mismatch; ten subcommands), so neither reduces to a
  pre-executed command. They get `disable-model-invocation` instead.
- 2026-09-04 — Chose the slot registry over the `specs/in-progress/` bucket as
  the source for zero-arg resolution, after finding the bucket absent from this
  repo — git does not store an empty directory.
- 2026-09-04 — Started. The spec was authored and linked while still untracked,
  so it was moved straight into `specs/in-progress/` on the branch rather than
  `git mv`-d out of `backlog` — it never existed in `backlog` on any commit.
