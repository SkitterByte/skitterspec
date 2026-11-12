---
github_identifier: "#195"
github_url: "https://github.com/SkitterByte/skitterspec/issues/195"
---

# Set a project's name and category from the agent

> **Type:** Feature
> **Name:** feat-project-command
> **Tracker:** https://github.com/SkitterByte/skitterspec/issues/195
> **Author:** Reuben Greaves
> **Raised:** 2026-11-12
> **Area:** packages/common/src/cli.js, packages/common/src/env/project.js, packages/common/src/env/config.js, packages/common/src/tada/, packages/common/assets/skills/spec-init/SKILL.md, docs/reference.html
> **Stack:** worktree
> **Docs:** reference

## Summary

A `skitterspec project` command that shows and sets a project's
`project.name` and `project.category` without hand-editing JSON, and a
`/spec-init` that asks for both — suggesting the categories your other
projects already use — so re-running it configures an existing repo.

## Problem

`project.name` and `project.category` (#191) can only be set by editing
`specs/.core/env.config.json` by hand, in every repo, and nothing helps pick a
category consistently — `work` in one repo and `Work stuff` in another split a
report in two. There is no skill an agent can use to set them, and no way to
see what a project is currently called or where that name comes from.

## Acceptance criteria

- `skitterspec project` prints the name and category and where each comes
  from (`project.name`, `review.projectName`, or the folder).
- `skitterspec project --name "Acme" --category work` writes only those two
  keys; every other key and the file's indentation are unchanged.
- `--name ""` / `--category ""` clears a value.
- `skitterspec project --categories` lists the categories already used by
  the projects in your Claude Code history.
- In a repo with no `env.config.json`, the command refuses and says why,
  creating nothing.
- `/spec-init` asks for the name (default: folder) and the category (offering
  the existing ones); on an existing repo the change is made on a `/no-spec`
  branch and landed, never written on main.

## Decisions

1. **One engine command, `skitterspec project`.** Bare reads; `--name` and
   `--category` write; `--json` for a script. Rejected: a `config set` for any
   key — the only keys anyone has asked to set are these two, and a general
   setter invites edits the merge silently ignores.
2. **It edits the file, it does not regenerate it.** Parse, set
   `project.name`/`project.category`, write back with the file's own
   indentation and key order. The `project` block is added after `mode` when
   absent.
3. **No `env.config.json`, no write.** That file's presence is what turns
   isolation on, so creating it to hold a category would change how every
   skill behaves as a side effect. The command refuses, naming
   `skitterspec init --isolation` as the way in.
4. **Categories come from the projects you actually use.** `--categories`
   reads the repos in your Claude Code transcripts (the discovery `tada`
   uses) and each one's `project.category`, with how many projects carry it.
   Compared case-insensitively, shown as first written.
5. **It writes the tree it runs in.** In a worktree that is the branch; it
   never reaches into the primary checkout. Committing is the caller's.
6. **`/spec-init` is the configure path.** It asks both questions — name
   defaulting to the folder, category picked from `--categories` or typed
   new. In a repo that already has `env.config.json`, it makes the change on a
   `/no-spec` branch and lands it, because main is a landing zone. A fresh
   `init --isolation` writes them into the file it is creating.

## Solution overview

`env/project.js` gains a pure `setProjectKeys(text, { name, category })` that
returns the edited JSON text, and `describeProject(config)` that returns each
value with its source. `cli.js` adds `project`, reading and writing the
config of the checkout it runs in. `--categories` reuses the tada transcript
scan to find repos and reads each one's config. `/spec-init` gains a
"Project name and category" step.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `skitterspec project [--name] [--category] [--categories] [--json]` |
| Skill/rule | update | `/spec-init` — asks for project name and category |
| Docs | update | reference.html — `project` command |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | `skitterspec project`: read, write, list categories | ⬜ | [01-project-command.md](01-project-command.md) |
| 2 | `/spec-init` asks for name and category | ⬜ | [02-spec-init.md](02-spec-init.md) |

## Open questions

- [ ] None

## Changelog

- 2026-11-12 — Spec created, following #191.
