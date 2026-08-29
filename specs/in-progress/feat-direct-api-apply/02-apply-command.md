# Phase 2 — `spec-sync apply` for one spec, end to end ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `skitterspec spec-sync apply <spec> --plan <file>` applies a plan over
the API — writing, verifying, stamping and recording — without any description
passing through the agent, and an interrupted run resumes without duplicating.

## Tasks

- [ ] Add the `apply` subcommand to `cli-sync.js`: `<spec> --plan <file>
      [--via api|mcp] [--project <id>] [--json]`, alongside the existing verbs.
- [ ] Refuse clearly on a plan carrying `legacy` — same stop as the skill does
      today, so the API path cannot abandon a pre-9.0 mirror faster than a human
      can read about it.
- [ ] Walk the plan in today's order: spec issue (create or update) → sub-issue
      creates (with `parentId`) → sub-issue updates.
- [ ] Stamp each returned id **as it arrives**, reusing `spec-sync stamp`'s
      validation path, so an interrupt leaves the work so far linked (Decision 5).
- [ ] Read each written description back and run it through the existing
      `verify` comparison; report divergence exactly as `spec-sync verify` does
      and keep it a warning, never a failure.
- [ ] Call `recordPush` once everything is stamped, so the next push is empty.
- [ ] Print the `{ issue: {id, identifier, url}, subIssues: {ref: id} }` map the
      skill needs, plus the transport used; `--json` for the machine form.
- [ ] `--via mcp` (or no key) prints the plan and the "apply over MCP"
      instruction and exits 0 without writing — the fallback the skill branches on.
- [ ] Add tests: a full create run against an injected `fetch`; an update run;
      an interrupted run re-applied produces updates and mints no duplicate; a
      legacy plan is refused before any write; a missing key on `--via api` fails
      before any write. Run the project's test command — green before the phase
      is done.

## Notes

`--project` carries the picker's choice in rather than prompting: `apply` must
stay non-interactive so phase 4 can call it in a loop.
