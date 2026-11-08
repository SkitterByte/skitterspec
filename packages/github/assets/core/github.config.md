# `github.config.json` — field reference

`specs/.core/github.config.json` is the committed half of GitHub sync: the
repo, the board, and env-var **names**. It never holds a token — that lives in
the environment or the user-level store (`spec-sync credentials set`).

A spec is a GitHub **issue**; each phase a **sub-issue** of it, its tasks a
task list in the body. GitHub stays a generated mirror: one-way, repo wins,
and a person's edit on GitHub is reported before the next push replaces it.

## Workflow state lives on a board

An issue is only open or closed. The states a spec moves through are the
options of a **Projects v2 single-select field** — `Status` by default — on a
board owned by `github.owner`. The board is **required**: an issue that is not
on it has no state at all, so every spec and phase issue is added to it as it
is minted. One board per repo.

The terminal buckets also close the issue itself, so the issue list agrees
with the board:

| Bucket | Board Status (default) | Issue |
|--------|------------------------|-------|
| `backlog` | Backlog | open |
| `in-progress` | In Progress | open |
| `complete` | Done | closed — `completed` |
| `cancelled` | Cancelled | closed — `not_planned` |

Option names must match the field's options exactly (case aside). An unknown
name is refused and the refusal lists the options the field does have.

**Map work states, not pipeline stages.** "On Test" is where a *release* is,
not where a spec's work is. If you track deploys on the board, keep them on a
field of your own that your CI sets — never as a Status option, or a finished
phase will read as deployed. See "Releases and deploys" below.

## Fields

| Key | Default | Meaning |
|-----|---------|---------|
| `github.owner` | — | The account or org that owns the repo **and** the board. Keys the stored token. |
| `github.repo` | — | Where spec issues are created. |
| `github.project` | — | The board's **number**, from its URL (`…/projects/7` → `7`). |
| `github.statusField` | `Status` | The single-select carrying workflow state. |
| `github.labels.spec` / `.phase` | `spec` / `phase` | Labels that tell a spec issue from a phase. Empty string = no label. |
| `github.issueTypes.spec` / `.phase` | — | Issue type names. **Org-owned repos only** — naming one on a personal repo is refused by GitHub. |
| `github.labelsByKind` | `{}` | One extra label per spec kind (`feature`/`bug`/`hotfix`/`chore`/`issue`/`incident`, from the folder prefix), applied beside `labels.spec` — `{ "chore": "chore" }` keeps tooling work filterable. Unmapped kinds add nothing. |
| `states.<bucket>` | see table | Board Status option per lifecycle bucket — a string, or an array whose first name is written and whose rest are read-only aliases. |
| `statesByKind.<kind>.<bucket>` | see table | Per-KIND override laid over `states` (GitHub has no work item types, so the spec's kind keys it) — `{ "issue": { "complete": "Done" } }`. A bucket set to `null` sends no Status; open/close still follows the bucket. |
| `github.severityLabels.<digit>` | `{}` | A label per `Severity:` header digit (`"2 - High"` → `"2"`) — `{ "2": "sev-high" }`, applied at mint. Unset, the header stays repo-only. A fix spec's `Incident:` header rides in the generated body as a `Related incident: #N` line. |
| `intake.label` | — | The label `/spec --from-issue` lists. |
| `intake.bugLabels` / `.hotfixLabels` | `["bug"]` / `[]` | Labels that route an adopted issue to `/spec-bug` / `/spec-hotfix`. |
| `auth.tokenEnv` | `GITHUB_TOKEN` | Env var holding the token; `GH_TOKEN` is read after it. |
| `mapping.description` | What a ticket body carries. `"summary"`: a delimited block (summary, acceptance criteria, surfaces touched, gating, spec path) spliced in beside the team's own text, which no push touches; phase sub-issues get a block with their goal. `"spec"`: the whole overview, replacing the body (the behaviour before this key). A config without the key is `spec`, so an upgrade rewrites no ticket. | `spec` |
| `summary.delimiter` | How the block is marked: `"comment"` (HTML comments, hidden on the rendered ticket) or `"heading"` (a `## Skitterspec summary` heading and an end line). GitHub keeps HTML comments verbatim (measured). A delimiter someone edited is reported and the block is left unwritten, never guessed at. | `comment` |
| `summary.progressField` | A board **Number** field to mirror % done into (ticked tasks over all tasks across the phase files), written on every push. A board without that field, or one that is not a Number field, is one line in the push report, never a failure. A spec with no checkboxes sends nothing. Works in either description mode. | `""` (off) |
| `mapping.phases` | `subissue` (one assignable sub-issue per phase), `deferred` (minted at `/spec-start`), `inline` (sections of the issue), or `none` (no phase objects; a phase already linked keeps its sub-issue). | `subissue` |
| `apply.transport` | — | `api` or `mcp`; unset = API when a token resolves. |
| `sync.baseDir` | `specs/.core/github-base` | Last-pushed snapshots. Commit them. |
| `sync.fieldOwnership` | `description`/`subIssues` `push`; `workflowState`/`assignee` `pull` | Who owns each field: the repo pushes the content, GitHub owns status and assignee (state sent only on a bucket move, assignee written directly by `assign`). `"push"` restores the repo-owned behaviour; `"none"` declines a field. |

## More than one name per bucket — read-only aliases

A board usually has more states than the four buckets: "Blocked", "Next
Sprint", "Released". A bucket's value may be an **array** instead of a string:

```jsonc
"states": {
  "in-progress": ["Active", "Blocked"],
  "complete": ["Closed", "Released"]
}
```

- **The first name is the only one push writes**, and only when the spec
  itself moves. The rest are never written.
- **The rest are read as that bucket** by the listing: the live
  `spec-sync list` hides every `complete` / `cancelled` name, `--state <bucket>`
  matches all of them, and `spec-sync states` lists each alias under its
  bucket.
- **Nothing is pulled.** An alias changes what the report *says* about a
  ticket, never the spec.
- A plain string works exactly as before. An alias that also names another
  bucket is refused at load. An alias the tracker lacks is reported by
  `spec-sync states` but never blocks a push, because it is never written.
- `spec-sync status` never reads an issue's Status at all, aliased or not:
  skitterspec tells the board about its own transitions and nothing else.

## Releases and deploys — the host project's to write

Skitterspec moves an issue's Status only at its own transitions, and it writes
nothing about releases or deployments. What a project records about a release
— a GitHub Release, a `Deployed` field, a comment — is its own CI's to write.

The one release question skitterspec answers is
**which issues a range contains**, because only the `Refs: #N` trailers know:

```sh
skitterspec-github spec-sync released "<previous-tag>..<tag>" --json
```

Each row carries the `ref`, its commit count, the `spec` that stamped it and its
`url` — `null` for a ref no spec has linked, never a guess. The checkout needs
`fetch-depth: 0` so the previous tag is visible. Pipe the list into `gh`, the
GraphQL API or anything else. This repo's own `scripts/mirror-deployed.cjs` is
a worked example: it sets the board's `Deployed` field on a tag push, on
approval, and hourly for approvals made elsewhere.

The `releases` block and the `spec-sync release` verbs are **retired**:
`release` exits 1 naming `released --json`, and `spec-sync doctor` flags a
leftover `releases` block as unused config (a warning, never a failure).

## The token

A **classic** personal access token with the `repo` and `project` scopes.
Fine-grained tokens are documented only for **org-owned** boards; on a
personal account's board use a classic one.

## Frontmatter it stamps

`github_identifier` (`#123`) and `github_url` on the overview,
`github_issue_id` on each phase file. Node ids are resolved at run time and
never written. A repo that moved from another tracker keeps its old stamps
(`linear_identifier`, …) untouched beside these.
