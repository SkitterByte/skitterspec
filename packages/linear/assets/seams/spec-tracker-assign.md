<!--
Seam fragment for the "spec-tracker-assign" seam, injected wherever a shared
skill has just decided WHO IS BUILDING a spec — beside the "Set Developer" step
in /spec-start, /spec-bug and /spec-hotfix. The build injects this body (comment
stripped) when composing the skitterspec-linear distribution; the base
distribution leaves the seam empty.

Placement is load-bearing: this stamps the spec file, so it must run BEFORE the
commit those skills make, or it is left uncommitted and `spec-env integrate`
refuses to land the branch later. See the placement tests in
packages/common/test/assets.test.js.
-->

**Only when all three hold**: `specs/.core/linear.config.json` exists, its
`sync.fieldOwnership` includes `assignee`, and the spec carries a
`linear_identifier`. Any one missing → skip this step silently and carry on; a
project that has not opted in must see no trace of assignment.

**Never blocks, never fails the skill.** Everything below is best-effort: the
branch is provisioned and the spec is moving either way, and an unassigned issue
is a cosmetic gap that `/spec-claim` closes later.

1. **Work out who you are.** Run `skitterspec spec-sync whoami --json`.
   - `ok: true` → use `id` and `name`. Nothing to ask.
   - `source: "mcp"` or the command reports no API key → call the discovered
     user-read tool with `me`, then cache it:
     `skitterspec spec-sync whoami --set <id> --name "<name>"`.
   - `ok: false` → identity is **unknown**, which is an ordinary state (a shared
     or bot key, an offline machine). Go to step 2.
2. **Unknown identity — three states, not two.** Decide by what is actually
   reachable, and route the third to inaction:
   - **Linear reachable *and* this is an interactive session** → offer a short
     user search (`skitterspec spec-sync users <name-or-email>`, or the
     user-list tool on MCP), let the operator pick, and offer to cache it with
     `whoami --set` so this is asked once per machine rather than once per spec.
   - **Not reachable, or not interactive** → say so in one line
     (`assignment skipped — no Linear identity`) and **carry on**. Do not prompt
     for something you could not act on, and never stall a `/spec-start` on it.
3. **Record it on the spec** — through the engine, never by hand-editing
   frontmatter:

   ```
   skitterspec spec-sync assign <spec> --to <user-id> --name "<display name>"
   ```

4. **Set `> **Developer:**` to the Linear display name**, falling back to
   `git config user.name` when identity is unknown. The visible header and the
   assignment then name the same person — which is what stops a later
   `/spec-claim` leaving the header crediting whoever started the spec.

**Nothing is pushed here.** `assign` writes the repo only, and the refresh these
skills already run sends it. Assignment is an ordinary field of the projection,
not a side errand with its own network call.

**There is no unassign step anywhere.** The projection derives the assignee from
the spec's lifecycle bucket, so `/spec-complete` and `/spec-cancel` release the
issue through the push they already make. The stamp deliberately stays in the
file: who actioned the work outlives who is currently holding it.
