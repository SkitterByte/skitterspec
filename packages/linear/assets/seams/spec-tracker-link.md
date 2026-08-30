<!--
Seam fragment for the "spec-tracker-link" seam — the FIRST push of a spec, which
mints its Linear issue. Injected into the shared /spec skill, and into the other
skills that create a spec (/spec-bug, /spec-hotfix). The build injects this body
(comment stripped) when composing the skitterspec-linear distribution; the base
distribution leaves the seam empty.

Deliberately spec-type-agnostic: it says "the spec you just wrote", never "this
feature", so a bug or hotfix reads correctly through the same text.
-->

**Only when `specs/.core/linear.config.json` exists** (Linear sync is opted in).
If it's absent, skip this entirely — the spec stays local-only and the skill
behaves exactly as above. When present, link the spec you just wrote so status
and discussion live in Linear while the repo stays the source of truth. A spec is
a Linear **issue**; each phase is a **sub-issue**, carrying that phase's tasks in
its description as a read-only checklist.

**Linking is just the first push**, so it runs the same engine path `/spec-push`
does — you never create the issue by hand:

1. **Pick the transport.** `skitterspec spec-sync states --json`. With a Linear
   API key set it answers `api` and prints the workspace's state names; without
   one it answers `mcp` and you do the MCP work `/spec-push` describes. Write the
   state names to a file for step 3.
2. **Pick the Project** — run the picker in **Picking the Linear Project** below.
   Keep the chosen id for step 4.
3. **Get the plan.**
   `skitterspec spec-sync push <spec> --workspace-states <file> --json > plan.json`
   — the spec is unlinked, so this plan is all-creates: the issue and one
   sub-issue per phase.
4. **Apply it.**
   `skitterspec spec-sync apply <spec> --plan plan.json --project <chosen id>`.
   That creates the issue and its sub-issues and checks what Linear stored. It
   then **stamps the ids into the spec** — `linear_identifier`/`linear_url` on the
   overview, `linear_issue_id` on each phase — and **records the base snapshot**,
   so `/spec-status` reports in-sync immediately. There is no hand-editing of
   frontmatter and no separate `stamp` or `record` call.

   If it prints `transport = mcp`, it wrote nothing: apply the plan over MCP as
   `/spec-push` steps 4a–5 describe, ending with `spec-sync stamp` and
   `spec-sync record`. That path is fully supported — it is what anyone without
   an API key uses.
5. **Echo the branch name** from `branch.pattern` so the user knows what
   `/spec-go` will fork.

**If Linear can't be reached**, say so in one line and leave the spec written and
local — it is still a perfectly good spec, and `/spec-push` links it later. Do
nothing destructive.

**A spec that adopted an existing issue** (see the intake step) is already
stamped, so its plan is an **update**, not a create: applying it replaces the
reporter's description with the spec. That is the one-way rule working as
intended — the repo is canonical and the original text stays in Linear's history.
Skip the project picker for an adopted issue: its placement is Linear's.

Leave committing to the existing convention (the user commits the spec as usual)
and **never auto-push git** — Linear's own automation reacts to real branch/PR
events later. Report the Linear issue URL as part of the skill's finish-up
message.
