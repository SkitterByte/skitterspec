# doctor verifies the project, and that both transports point at the same place

> **Type:** Feature
> **Name:** feat-doctor-tracker-alignment (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-03)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-03
> **Area:** packages/linear/src/doctor.js, packages/linear/src/cli-sync.js, packages/linear/src/api.js, packages/common/assets/skills/spec-linear-setup/SKILL.md
> **Stack:** worktree

## Problem

A repo reaches Linear over **two** transports, chosen per invocation
(`cli-sync.js:819` — `flags.via || config.apply.transport || (key.ok ? 'api' : 'mcp')`),
and nothing checks they agree:

- **`linear.projectId` is never verified, on either transport.** It is read at
  `cli-sync.js:1109` and passed straight into the create payload. A stale id, or
  one belonging to another team, files specs somewhere nobody is looking — and
  the first sign is a spec that is simply not where it should be.
- **`doctor --check-remote` is API-only**, and its `remote` row is *skipped*
  entirely when no key resolves. An MCP-only repo therefore gets **zero** remote
  verification: `skitterload` has no `auth` block and an empty `projectId`, and
  `doctor` calls it ready.
- **Nothing compares the workspace the API key belongs to with the workspace the
  MCP server is connected to.** They can differ. Same repo, same config, and the
  destination depends on which transport happened to run.

`doctor` is the command a skill runs before it writes, so an unverified
destination is the one gap where being wrong writes to someone else's workspace.

## Decisions

1. **An empty `projectId` is `missing`, not `broken`** — a declined opt-in that
   exits 0, with the detail saying specs file to the team and the picker offers a
   project each push. `config.js:82` already calls it "the picker's DEFAULT, not
   a mandate", and `skitterload` runs that way deliberately. Rejected making it
   `broken`: it would fail the run for every repo that files to the team only.
2. **Never auto-fill a project id.** Resolving the team's projects and writing the
   single hit into the config infers a decision from an absence — the shape
   [`.claude/rules/negative-checks.md`](../../../.claude/rules/negative-checks.md)
   exists to stop — and writes to a committed file on a guess.
3. **The skill fetches over MCP; `doctor` judges.** Same split as
   `--workspace-states` and `verify --stored`: a skill reads team/project/workspace
   over MCP into a file, `doctor --mcp <file>` compares it against the config and
   the API's answer. Rejected teaching the engine MCP — the offline engine is what
   makes every branch testable from a literal.
4. **A workspace mismatch is `broken`, names both identities, and fixes nothing.**
   Exit 1 with the API's workspace and the MCP server's workspace printed, and the
   command to re-run setup. Rejected preferring either side: choosing a winner is
   guesswork about which one the user meant, and the losing side may be the
   correct one. Rejected nulling the field: it destroys working config over what
   may be a transient MCP connection.
5. **Identity is compared on ids, not names.** Organization id, team id, project
   id — a rename must not read as a mismatch (the `retarget` work already
   established that a team key is not identity).
6. **Both new rows carry a stays-silent test.** They accuse, they exit non-zero,
   and skills branch on the code — so the rule the repo ships applies to them
   first.

## Solution overview

Two new `doctor` rows, and one new input.

**`project`** — offline it reports what the config says; with `--check-remote` it
resolves the id and confirms the project belongs to the configured team.

```
project    missing   no linear.projectId — specs file to the team; the picker asks each push
project    ok        "Platform" (71179728) in team SKS
project    broken    linear.projectId 7117… is not a project of team SKS
```

**`mcp`** — `skipped` unless `--mcp <file>` is passed (the skill fetched it),
then it compares the MCP server's workspace/team/project against the config and,
when both are present, against the API's answer:

```
mcp        skipped   pass --mcp <file> to check the MCP server's workspace
mcp        ok        workspace "skitterbyte" — matches the API key and the config
mcp        broken    the API key is in workspace "skitterbyte" (a1b2…), the MCP
                     server is connected to "acme" (c3d4…) — writes land in
                     whichever transport runs
```

The file is the shape the skill can produce from `get_workspace` / `get_team` /
`get_project`:

```json
{ "workspace": {"id": "…", "name": "…"}, "team": {"id": "…", "key": "SKL"},
  "project": {"id": "…", "name": "…"} }
```

`readProject` and `readOrganization` are added to the API adapter. The operation
contract (`api.test.js:110`) permits this: the API adapter may add ops, it may
only never be *missing* one.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | update | `spec-sync doctor` — `project` + `mcp` rows, `--mcp <file>` |
| Service | add | `readProject`, `readOrganization` on the API adapter |
| Business rule | add | a workspace mismatch is `broken`; an empty project is `missing` |
| Skill/rule | update | `/spec-linear-setup` fetches the MCP facts for `--mcp` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | The project row | ⬜ | [01-project-row.md](01-project-row.md) |
| 2 | The MCP row and the cross-check | ⬜ | [02-mcp-row.md](02-mcp-row.md) |
| 3 | Teach the setup skill to fetch it | ⬜ | [03-skill-wiring.md](03-skill-wiring.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-03 | Ready | backlog | Reuben Greaves |
| 2026-09-03 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-03 — Spec created after `skitterload` was found configured with an
  empty `projectId` and no API key, which `doctor` reports as ready.
