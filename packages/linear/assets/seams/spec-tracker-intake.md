<!--
Seam fragment for the "spec-tracker-intake" seam in the shared /spec and
/spec-bug skills. Runs BEFORE the grill: it turns an existing Linear issue into
the starting material for a spec, and makes that issue the spec's own issue.
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
3. **Route bugs away.** If any label matches `intake.bugLabels`, this is a bug
   report: say so and tell the user to run **`/spec-bug <ISSUE-REF>`** instead of
   authoring a Feature spec here. (In `/spec-bug`, this phase behaves identically —
   adopt the issue, then reproduce as usual.)
4. **Seed, don't skip, the grill.** The issue's title becomes the working spec
   title and its description the starting material for **Problem** — quote the
   reporter's words rather than paraphrasing them away. Note the reporter and the
   issue URL for context. Everything after this runs exactly as normal: an issue
   is a *request*, not a groomed spec, so grill it as hard as anything else.

### Adopting the issue

The issue **becomes** the spec's issue — it is not copied and no second issue is
minted. After writing the spec:

- **Stamp `linear_identifier` and `linear_url`** in `00-overview.md` frontmatter
  from the adopted issue. That is the whole link: every later skill
  (`/spec-push`, `/spec-status`, `/spec-go`) keys off it being present.
- **Do not run the project picker** and never send `project`. The issue was filed
  somewhere deliberately — where it lives is Linear's business, and adoption is
  not a mint.
- **Do not write a base sidecar.** Leaving `sync.baseDir` empty for this spec is
  what makes the first `/spec-push` push the spec over the reporter's original
  description (an **update** to the existing issue, plus a sub-issue per phase).
  Recording a snapshot here would declare the mirror already in sync and strand
  the issue showing the raw report forever.
- **Say what will happen** in the finish-up message: the first `/spec-push` will
  overwrite the issue's description with the spec, and the original report is
  preserved in the spec's **Problem** section.
