<!--
Seam fragment for the "spec-tracker-intake" seam in the shared /spec, /spec-bug
and /spec-hotfix skills. Runs BEFORE the grill (and, in /spec-hotfix, before the
base tag is established): it turns an existing Linear issue into the starting
material for a spec, and makes that issue the spec's own issue.
The build injects this body when composing the skitterspec-linear distribution;
the base distribution leaves the seam empty.
-->

## Phase 0 — start from a Linear issue (only when asked)

**Only when `specs/.core/linear.config.json` exists** *and* the invocation names an
issue. Otherwise skip this phase entirely and grill from the user's own words.

Two ways in:

- **`<ISSUE-REF>`** (`SKI-123`, an issue URL, or a bare id anywhere in the
  arguments) — adopt that issue.
- **`--from-issue [query]`** — browse the intake inbox: issues carrying
  `intake.label` (what the web app files under). With a `query`, filter that list
  case-insensitively by title. Show the shortlist and let the user pick one.

Then:

1. **Exclude what's already adopted.** Run `skitterspec spec-sync linked --json`
   and drop any issue whose identifier is already stamped on a spec. If the user
   named such an issue directly, **stop** and point them at that spec — one issue
   never becomes two specs.
2. **Read the issue** with the discovered issue-read tool: title, description,
   labels, reporter, URL. If Linear isn't connected, say so and offer to carry on
   without it — a spec written from the user's own description is still a spec.
3. **Route the issue to the right skill.** Match the issue's labels
   (case-insensitively) against two lists, **checking `hotfixLabels` first**:

   - **`intake.hotfixLabels`** → this is broken in **production**, so it needs a
     fix against the released version, not `main`. Say so, name the matching
     label, and tell the user to run **`/spec-hotfix <ISSUE-REF>`** — then stop.
   - **`intake.bugLabels`** → a bug report, not a feature request. Say so, name
     the label, and tell the user to run **`/spec-bug <ISSUE-REF>`** — then stop,
     without authoring a Feature spec.

   **Hotfix wins when an issue carries both**, and deliberately: production is the
   more specific destination, and the two mistakes are not equally costly. Routing
   a prod issue to `/spec-bug` produces a fix that lands on `main` and never
   reaches the running version — discovered only when someone asks why it hasn't
   shipped. The reverse is a hotfix branch for something that could have waited,
   which is merely wasteful.

   With a list unset, nothing routes through it; with both unset every issue is
   treated as a feature request, exactly as before.

   **Which checks run depends on where you are**, because a skip is about not
   bouncing someone to the skill they are already in — not about ignoring an
   escalation:

   - **In `/spec`** — both checks run.
   - **In `/spec-bug`** — the bug check is skipped (it would route you to
     yourself), but the **hotfix check still runs**. A bug report labelled for
     production is not "already handled" by being in the bug path: `/spec-bug`
     fixes on `main`, and prod would stay broken. Say so and hand off.
   - **In `/spec-hotfix`** — both are skipped. It is already the most specific
     destination; there is nowhere left to route.

   Then adopt the issue and reproduce it as usual: the issue body is your repro
   material, and the failing test comes before the spec exactly as normal.
4. **Seed, don't skip, the grill.** The issue's title becomes the working spec
   title and its description the starting material for **Problem** — or
   **Symptom** in a bug or hotfix spec, which is where a report belongs. Quote the
   reporter's words rather than paraphrasing them away. Note the reporter and the
   issue URL for context. Everything after this runs exactly as normal: an issue
   is a *request*, not a groomed spec, so grill it as hard as anything else.

   **In `/spec-hotfix`, also mine the issue for a version.** Any release-shaped
   string in the report is a *suggestion* for the base tag, offered when the skill
   asks which version prod is running — never used as a default. The reporter's
   version is the one they saw the bug on, which is often not what is deployed.

### Adopting the issue

The issue **becomes** the spec's issue — it is not copied and no second issue is
minted. This is identical in `/spec`, `/spec-bug` and `/spec-hotfix`; only *when*
it happens differs (`/spec` writes the spec in Phase B, `/spec-bug` in its step 4,
`/spec-hotfix` in its step 5). Once the spec file exists:

- **Stamp `linear_identifier` and `linear_url`** in `00-overview.md` frontmatter
  from the adopted issue. That is the whole link: every later skill
  (`/spec-push`, `/spec-status`, `/spec-go`) keys off it being present.
- **Do not run the project picker** and never send `project`. The issue was filed
  somewhere deliberately — where it lives is Linear's business, and adoption is
  not a mint.
- **Do not write a base sidecar.** Leaving `sync.baseDir` empty for this spec is
  what makes the **linking push** send the spec over the reporter's original
  description (an **update** to the existing issue, plus a sub-issue per phase).
  Recording a snapshot here would declare the mirror already in sync and strand
  the issue showing the raw report forever.
- **Say what will happen** in the finish-up message. The linking step runs right
  after the spec is written, so the issue's description is replaced by the spec
  **then** — not on some later manual push. The reporter's words are not lost:
  they are quoted in the spec's **Problem** (or **Symptom**) section, and Linear
  keeps the original in the issue's history.
