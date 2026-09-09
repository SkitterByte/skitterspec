---
linear_identifier: "SKS-109"
linear_url: "https://linear.app/skitterbyte/issue/SKS-109/assign-the-linear-issue-to-the-developer-working-the-spec"
---

# Assign the Linear issue to the developer working the spec

> **Type:** Feature
> **Name:** feat-linear-assignment (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — Phase 3 (started 2026-09-09)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-09
> **Area:** packages/linear/src/{identity,credentials,api,mcp,cli-sync,doctor,config}.js, packages/sync-core/src/{normalize,push,compare}.js, packages/linear/assets/{seams,skills,core}, packages/common/assets/skills/{spec-start,spec-bug,spec-hotfix}
> **Stack:** worktree

## Problem

A spec in flight names its developer in the repo (`> **Developer:**`) but nobody
in Linear. The mirror shows what is being built and which phase it is on, and
leaves "by whom" blank — so the one view a team actually opens to answer *who is on this*
is the one view that cannot. Assignee is currently untouched by sync,
deliberately grouped with priority and labels as Linear-native triage; but
unlike those, the repo genuinely knows the answer, and knows it first.

Two things have to exist before it can be pushed: an answer to *who am I in this workspace*
(skitterspec has never had one), and a way to hand a spec over mid-flight
without editing frontmatter by hand.

## Decisions

1. **Identity is derived from the credential, not configured.** Both transports
   already carry a positive "who am I" signal — the API key belongs to a person
   (`query { viewer { id name } }`) and MCP has `get_user { query: "me" }`. So the
   common case needs no config and asks no question. *Rejected:* a `linear.userId`
   in `specs/.core/linear.config.json` — that file is committed and shared, so one
   id there mis-assigns every teammate who clones the repo.
2. **The resolved identity caches in the user-level credentials store**
   (`~/.config/skitterspec/credentials.json`, keyed by `teamId`, mode 0600),
   beside the API key it was derived from. Identity is per-user-per-workspace,
   which is exactly that store's existing shape — one file serving every checkout.
3. **Resolution order, first hit wins:** cached entry → derive from the credential
   → prompt with a user search → unknown. The prompt exists for the case
   derivation cannot serve: a shared/bot API key, where `viewer` is the bot and
   not the human at the keyboard. `spec-sync whoami --set` is the same override
   run deliberately.
4. **Unknown identity is a third state, routed to inaction.** Linear reachable
   *and* interactive → prompt. Unreachable, or non-interactive → one line saying
   assignment was skipped, and carry on. A `/spec-start` never fails, hangs, or
   stops over an assignment; `/spec-claim` repairs it later.
5. **Assignee is a projection field, not an event.** The spec's overview
   frontmatter records `linear_assignee_id`; the push derives what to send from the
   lifecycle bucket, exactly as `workflowState` already is. *Rejected:* firing an
   assign at `/spec-start` and an unassign at `/spec-complete` outside the
   projection — nothing would record it, `/spec-status` could not report it, and a
   failed assign at start would be silently lost forever.
6. **Unset means don't touch.** A spec with no recorded assignee sends no assignee
   at all, so a PM's pre-assignment on a backlog issue survives untouched. Only a
   spec that *has* been assigned through the repo is ever cleared. *Rejected:* full
   ownership (an unset spec actively clears Linear's assignee) — more consistent,
   but it wipes triage the moment anyone pushes.
7. **The bucket decides, not the frontmatter's presence.** Assignee is pushed while
   the spec is live (`backlog`, `in-progress`) and cleared in the terminal buckets
   (`complete`, `cancelled`) — so finishing a spec hands the issue back
   automatically, with no unassign step to remember. The `> **Developer:**` header
   is *not* cleared: it is the durable record of who actioned it.
8. **`sync.fieldOwnership.assignee: "push"` is the opt-in**, and no new config key
   is invented — that map is already documented as the extension point ("any key
   you add joins the pushed projection"). Absent (the default) = the whole feature
   is inert: no writes, no prompts, no drift line.
9. **A snapshot with no `assignee` key means "never pushed", not "was null".**
   Every existing linked spec has such a snapshot. Read as `null`, the first push
   after upgrade emits a *clear* against every one of them. The diff therefore
   emits an assignee op only when there is something to assert, or a
   **previously-pushed** assignee to retract — never on absence alone. See
   `.claude/rules/negative-checks.md`.
10. **Only the spec issue is assigned; phase sub-issues are not.** One person
    builds a spec, and N assigned sub-issues is N notifications for one piece of
    work. Phases stay independently assignable *in Linear* — this feature simply
    never writes to them.
11. **`/spec-claim` is the transfer command** — take, `--release` to hand back,
    `--to <user>` to give to a named teammate. It is user-invocable only, like
    `/spec-push` and `/spec-status`. `--to` is the one place the repo writes into
    another person's Linear inbox; that is accepted deliberately, as the lead's
    distribute-work case, and it always resolves the target through a user search
    rather than a hand-typed id.
12. **`Developer:` prefers the Linear display name when identity resolved**,
    falling back to `git config user.name`. Otherwise a `/spec-claim` leaves the
    visible header naming one person and the assignee naming another — and the
    header is what a reader trusts.
13. **`/spec-next` never asks.** It backfills a missing assignee silently and lets
    the push it already runs carry it; a spec assigned to someone else gets one
    line and no write. An assignment question in the middle of a build is an
    interruption with no deadline.

## Solution overview

**Identity** — a new `packages/linear/src/identity.js` resolves `{ id, name }`
through decision 3 and caches into the credentials store as
`teams[<teamId>].user`. Two CLI verbs surface it, following the established
"engine answers on the API path, says `transport = mcp` and lets the skill do the
call" contract used by `states` and `projects`:

```
skitterspec spec-sync whoami [--json] [--set <id> --name <n>] [--unset]
skitterspec spec-sync users [<query>] [--json]      # name/email search, paged
```

**Projection** — `linear_assignee_id` (+ `linear_assignee_name` for display) join
the overview frontmatter next to `linear_identifier`. `projectionOf` derives
`assignee` from the bucket (decision 7); `specIssueFieldHashes` gains a third
per-field hash, with the absence rule from decision 9 deciding whether an op is
emitted at all. Apply sends `assigneeId` on `issueUpdate` (API) or `save_issue`
(MCP); `spec-sync status` grows a drift line when Linear's assignee differs.

**Stamping is explicit, never inferred by the push.** Only `/spec-start` (and its
test-first siblings) and `/spec-claim` write the frontmatter, via a new
`spec-sync assign` verb. A push that stamped identity itself would quietly steal
a spec the moment a teammate pushed someone else's work.

**Skills** — a new `spec-tracker-assign` seam sits in `/spec-start` step 4 beside
"Set Developer", and in `/spec-bug` / `/spec-hotfix` where they set it
immediately. `spec-next-start` gains the backfill rule. `/spec-complete` and
`/spec-cancel` need nothing: the bucket change clears the assignee through the
push they already run.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| CLI command | add | `spec-sync whoami`, `spec-sync users`, `spec-sync assign` |
| CLI command | update | `spec-sync status` (+assignee drift line), `spec-sync apply` (sends `assigneeId`) |
| Config key | add | `sync.fieldOwnership.assignee: "push"` — opt-in; absent = inert |
| Credentials store | update | `teams[<teamId>].user = { id, name }` (v1 schema, additive) |
| Spec frontmatter | add | `linear_assignee_id`, `linear_assignee_name` on `00-overview.md` |
| Spec header | update | `> **Developer:**` prefers the Linear display name |
| Domain object | update | projection gains `assignee`; `specIssueFieldHashes` gains a third hash |
| Skill | add | `/spec-claim` (take · `--release` · `--to <user>`), user-invocable only |
| Skill/seam | add | `spec-tracker-assign` → `/spec-start`, `/spec-bug`, `/spec-hotfix` |
| Skill/seam | update | `spec-next-start` (backfill + flag someone else's) |
| Skill | update | `/spec-linear-setup` interview step; `doctor` identity check |
| Docs | update | `linear.config.md`, `core/SETUP.md`, `rules/spec-planning.md` |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Resolve and cache "who am I in Linear" | ✅ | [01-identity.md](01-identity.md) |
| 2 | Push the assignee as a projection field | ✅ | [02-projection.md](02-projection.md) |
| 3 | Stamp the assignee from the lifecycle skills | ✅ | [03-lifecycle-seams.md](03-lifecycle-seams.md) |
| 4 | `/spec-claim` — take, release, hand over | ⬜ | [04-spec-claim.md](04-spec-claim.md) |
| 5 | Setup, doctor and docs | ⬜ | [05-setup-and-docs.md](05-setup-and-docs.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-09 | Ready | backlog | Reuben Greaves |
| 2026-09-09 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-09 — Spec created.
- 2026-09-09 — Phase 1: the `docs/linear.html` command-table rows for `whoami`
  and `users` landed here rather than in phase 5. `scripts/docs-claims.test.js`
  asserts every dispatched verb is documented, so a phase adding a verb cannot
  end green without its row. Phase 5's doc tasks (config reference, SETUP,
  spec-planning prose) are unaffected.
- 2026-09-09 — Phase 1: identity caching lives in the `whoami` CLI, not in
  `resolveIdentity`. A resolver that wrote to disk as a side effect of being
  asked a question would cache a bot's identity the first time CI ran.
- 2026-09-09 — Phase 2: a second absence trap surfaced beyond decision 9. The
  legacy COMBINED-hash snapshot never had assignee as an input, so an assignment
  could never land while description and state sat still — it would have waited
  for an unrelated prose edit. That branch now asserts a recorded assignee (one
  redundant write at worst) while still never guessing at a clear.
- 2026-09-09 — Phase 2: `assigneeId` is applied AFTER `withoutNull` in the apply
  path. Null is the payload for that field — it is how Linear unassigns — so the
  stripper every other field goes through would have silently dropped exactly the
  clear `/spec-complete` depends on, with a successful-looking push to show for it.
- 2026-09-09 — Phase 3: `spec-sync assign` moved here from phase 4. The seams
  call it, and a seam pointing at a command that does not exist is not an
  independently shippable phase. Phase 4 is now the `/spec-claim` skill alone.
- 2026-09-09 — Phase 3: releasing needed a new `deleteFrontmatter`.
  `writeFrontmatter` skips nullish values by design — that is what lets callers
  send sparse patches — so "remove this key" is inexpressible there. Blanking the
  field instead would leave a spec assigned to nobody in particular, and the
  projection reads presence, not emptiness. Same shape as the `withoutNull` trap
  in phase 2: a null-skipping helper cannot say "delete".
- 2026-09-09 — Phase 3: the existing assets test asserting `/spec-start` carries
  NO seam marker encoded the old design and now names the four *pushing* seams it
  excludes instead. Banning the marker outright would fail the moment any
  non-pushing seam arrived, which is exactly what happened.
- 2026-09-09 — Phase 2: the `status` assignee line is keyed on the PLAN, not on
  whether the two sides differ. Three ways to differ, one of them drift: a spec
  recording nobody will not overwrite Linear, and an already-pushed assignee
  changed in Linear will not be re-sent. Saying "repo wins on next push" in
  either case would be an accusation and a promise the engine would not keep.
