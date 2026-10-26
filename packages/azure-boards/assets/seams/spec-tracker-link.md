<!--
Seam fragment for the "spec-tracker-link" seam — the FIRST push of a spec, which
mints its Azure Boards work item. Injected into the shared /spec skill, and into
the other skills that create a spec (/spec-bug, /spec-hotfix). The build injects
this body (comment stripped) when composing the skitterspec-azure-boards
distribution; the base distribution leaves the seam empty.

Deliberately spec-type-agnostic: it says "the spec you just wrote", never "this
feature", so a bug or hotfix reads correctly through the same text.
-->

**Only when `specs/.core/azure-boards.config.json` exists** (Azure Boards sync
is opted in). If it's absent, skip this entirely — the spec stays local-only and
the skill behaves exactly as above. When present, link the spec you just wrote
so status and discussion live in Boards while the repo stays the source of
truth. A spec is a **work item**; each phase is a **child work item**, carrying
that phase's tasks in its description as a read-only markdown checklist.

**Linking is just the first push**, so it runs the same engine path `/spec-push`
does — you never create the work item by hand:

1. **Pick the transport.** `skitterspec spec-sync states --json`. With a PAT set
   it answers `api` and prints the configured types' state names; without one it
   answers `mcp` and you do the MCP work `/spec-push` describes. Write the state
   names to a file for step 2.
2. **Get the plan.**
   `skitterspec spec-sync plan <spec> --workspace-states <file> --json > plan.json`
   — the spec is unlinked, so this plan is all-creates: the work item and one
   child per phase.
3. **Apply it.**
   `skitterspec spec-sync apply <spec> --plan plan.json`. There is no project
   to pick: the item lands in the configured `azure.project` by construction.
   That creates the work item and its children and checks what Boards stored.
   It then **stamps the ids into the spec** — `azure_identifier`/`azure_url` on
   the overview, `azure_item_id` on each phase — and **records the base
   snapshot**, so `/spec-status` reports in-sync immediately. There is no
   hand-editing of frontmatter and no separate `stamp` or `record` call.

   If it prints `transport = mcp`, it wrote nothing: apply the plan over MCP as
   `/spec-push` steps 4a–5 describe, ending with `spec-sync stamp` and
   `spec-sync record`. That path is fully supported — it is what anyone without
   credentials uses.
4. **Echo the branch name** from `branch.pattern` so the user knows what
   `/spec-start` will fork.

**If Azure can't be reached**, say so in one line and leave the spec written and
local — it is still a perfectly good spec, and `/spec-push` links it later. Do
nothing destructive.

**A spec that adopted an existing work item** (see the intake step) is already
stamped, so its plan is an **update**, not a create: applying it replaces the
reporter's description with the spec. That is the one-way rule working as
intended — the repo is canonical, and the original was preserved as a comment
on the item by the intake step. Nothing re-homes an adopted item: where it
lives stays Boards'.

Leave committing to the existing convention (the user commits the spec as usual)
and **never auto-push git** — Boards automation reacts to real branch/PR events
later, where a repo has wired any. Report the work item URL as part of the
skill's finish-up message.
