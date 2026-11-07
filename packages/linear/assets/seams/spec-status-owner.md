<!--
Seam fragment for the "spec-status-owner" seam, injected immediately before a
shared skill writes a spec's `Status:` header, `Developer:` line or State log
row: /spec, /spec-bug, /spec-hotfix, /spec-incident, /spec-start,
/spec-complete, /spec-cancel and /spec-review. The build injects this body
(comment stripped) when composing the skitterspec-linear distribution; the base
distribution leaves the seam empty, so a repo with no tracker writes every
header exactly as before.

Placement is load-bearing: it must come BEFORE the writes it switches off. See
the placement tests in packages/common/test/assets.test.js.
-->

**Who owns this spec's status.** Only when `specs/.core/linear.config.json` exists.
Run `skitterspec spec-sync ownership --json` once and read both values:

- **`workflowState: "pull"`** — Linear is the record of this spec's status, so
  this skill **writes no `> **Status:**` header and appends no State log row**,
  wherever its steps below say to. A spec this skill creates gets neither: its
  header carries `> **Tracker:** <issue url>` instead, filled in once linking
  has stamped the url, and its body has no `## State log` section. Readiness is
  the spec's own content — a `Draft` is a spec whose **Open questions** is not
  empty — so nothing is lost with the header.
- **`assignee: "pull"`** — Linear holds who is building it, so this skill
  **writes no `> **Developer:**` line** either.
- **Anything else** — `push`, `none`, sync reported off, or the command failing
  — is cannot-tell, and the steps below run exactly as written.

What `pull` leaves alone: the folder move (a bucket records what the repo did to
the code, not a planning status), the phase files and index, and the Changelog.
A reason a `Status:` header would have carried — a cancellation's, a knock-back
to Draft — goes in a dated Changelog line instead. A spec that already carries
any of these lines keeps them untouched: they are history, and nothing rewrites
them.
