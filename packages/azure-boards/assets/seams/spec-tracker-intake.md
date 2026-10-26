<!--
Seam fragment for the "spec-tracker-intake" seam in the shared /spec, /spec-bug
and /spec-hotfix skills. Runs BEFORE the grill (and, in /spec-hotfix, before the
base tag is established): it turns an existing Azure Boards work item into the
starting material for a spec, and makes that item the spec's own item.
The build injects this body when composing the skitterspec-azure-boards
distribution; the base distribution leaves the seam empty.
-->

## Phase 0 — start from an Azure Boards work item (only when asked)

**Only when `specs/.core/azure-boards.config.json` exists** *and* the invocation
names a work item. Otherwise skip this phase entirely and grill from the user's
own words.

Two ways in:

- **`<ITEM-REF>`** (`AB#123`, a bare item number, or a work item URL anywhere in
  the arguments) — adopt that item.
- **`--from-issue [query]`** — browse the intake inbox: items carrying
  `intake.tag` (what the PM files under). With a `query`, filter that list
  case-insensitively by title. Show the shortlist and let the user pick one.

Then:

1. **Exclude what's already adopted.** Run `skitterspec spec-sync linked --json`
   and drop any item whose identifier is already stamped on a spec. If the user
   named such an item directly, **stop** and point them at that spec — one work
   item never becomes two specs.
2. **Read the item** with the discovered work-item-read tool: title,
   description, tags, reporter, URL. If Azure isn't connected, say so and offer
   to carry on without it — a spec written from the user's own description is
   still a spec.
3. **Route the item to the right skill.** Match the item's work item **TYPE**
   against `intake.hotfixTypes`/`intake.bugTypes` and its **TAGS**
   (case-insensitively — Boards has tags, not labels) against
   `intake.hotfixTags`/`intake.bugTags`, **checking the hotfix lists first**.
   A match on *either* axis routes; the type check exists because in the
   Agile, Scrum and CMMI processes a bug is a **type**, not a tag, so a
   support-filed `Bug` with no tags at all still belongs in `/spec-bug`:

   - **`intake.hotfixTypes` or `intake.hotfixTags`** → this is broken in
     **production**, so it needs a fix against the released version, not
     `main`. Say so, name the matching type or tag, and tell the user to run
     **`/spec-hotfix <ITEM-REF>`** — then stop.
   - **`intake.bugTypes` or `intake.bugTags`** → a bug report, not a feature
     request. Say so, name the matching type or tag, and tell the user to run
     **`/spec-bug <ITEM-REF>`** — then stop, without authoring a Feature spec.

   **Hotfix wins when an item matches both**, and deliberately: production is the
   more specific destination, and the two mistakes are not equally costly. Routing
   a prod issue to `/spec-bug` produces a fix that lands on `main` and never
   reaches the running version — discovered only when someone asks why it hasn't
   shipped. The reverse is a hotfix branch for something that could have waited,
   which is merely wasteful.

   `bugTypes` defaults to `["Bug"]`; an explicit empty list opts type routing
   out. With a tag list unset, nothing routes through it; with every list
   empty, each item is treated as a feature request, exactly as before.

   **Which checks run depends on where you are**, because a skip is about not
   bouncing someone to the skill they are already in — not about ignoring an
   escalation:

   - **In `/spec`** — both checks run.
   - **In `/spec-bug`** — the bug check is skipped (it would route you to
     yourself), but the **hotfix check still runs**. A bug report tagged for
     production is not "already handled" by being in the bug path: `/spec-bug`
     fixes on `main`, and prod would stay broken. Say so and hand off.
   - **In `/spec-hotfix`** — both are skipped. It is already the most specific
     destination; there is nowhere left to route.

   Then adopt the item and reproduce it as usual: the item body is your repro
   material, and the failing test comes before the spec exactly as normal.
4. **Seed, don't skip, the grill.** The item's title becomes the working spec
   title and its description the starting material for **Problem** — or
   **Symptom** in a bug or hotfix spec, which is where a report belongs. Quote the
   reporter's words rather than paraphrasing them away (an HTML-era description
   reads back as reduced text — quote that). Note the reporter and the item URL
   for context. Everything after this runs exactly as normal: a work item is a
   *request*, not a groomed spec, so grill it as hard as anything else.

   **In `/spec-hotfix`, also mine the item for a version.** Any release-shaped
   string in the report is a *suggestion* for the base tag, offered when the skill
   asks which version prod is running — never used as a default. The reporter's
   version is the one they saw the bug on, which is often not what is deployed.

### Adopting the work item

The item **becomes** the spec's item — it is not copied and no second item is
minted. This is identical in `/spec`, `/spec-bug` and `/spec-hotfix`; only *when*
it happens differs (`/spec` writes the spec in Phase B, `/spec-bug` in its step 4,
`/spec-hotfix` in its step 5). Once the spec file exists:

- **Stamp `azure_identifier` and `azure_url`** in `00-overview.md` frontmatter
  from the adopted item (`spec-sync stamp <spec> --issue AB#123` does both and
  verifies the id when it can). That is the whole link: every later skill
  (`/spec-push`, `/spec-status`, `/spec-start`) keys off it being present.
- **Adoption is not a mint.** The item was filed somewhere deliberately — it
  stays where it is, area path included, and nothing re-homes it.
- **Do not write a base sidecar.** Leaving `sync.baseDir` empty for this spec is
  what makes the **linking push** send the spec over the reporter's original
  description (an **update** to the existing item, plus a child per phase).
  Recording a snapshot here would declare the mirror already in sync and strand
  the item showing the raw report forever.
- **Preserve the original, before anything replaces it.** Run this the moment
  the spec file exists and **before the linking push**:

  ```
  skitterspec spec-sync preserve <spec>
  ```

  It posts the item's current description onto the item as a comment — the one
  surface one-way sync never touches, so no push can clobber it. On the API path
  it reads the description itself (HTML-era descriptions are reduced to text);
  without credentials it prints the body and the marker, and you post it with
  the discovered comment tool after checking the comments for that marker.

  **The ordering is the whole correctness condition.** Run before the push, this
  keeps what the reporter filed. Run after it, it would keep the generated spec
  and report success — which is why it is a step of its own here rather than a
  line in the push sequence. The engine warns when it can tell it is late, but it
  cannot always tell.

  **It never fails the adoption.** A project that set
  `intake.preserveOriginal: false`, an unreachable Azure, an item with no
  description, a comment Azure refused — every one of them exits 0 and says so.
  Relay what it printed and carry on.
- **Say what will happen** in the finish-up message. The linking step runs right
  after the spec is written, so the item's description is replaced by the spec
  **then** — not on some later manual push. Say both halves: the description
  becomes the spec, **and** the original is preserved as a comment on the same
  item, so the reporter can still read what they wrote.

  **Do not send anyone to the item's history for it.** Boards does keep field
  history, and that is true and useless: history is a diff viewer nobody opens,
  it is not quotable, and it degrades to "it is in there somewhere". The comment
  is the answer, and the other half is the spec's own **Problem** (or
  **Symptom**) section quoting the reporter.
