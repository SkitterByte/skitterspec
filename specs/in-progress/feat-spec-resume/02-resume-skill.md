---
github_issue_id: "#243"
---

# Phase 2 — `/spec-resume` skill and the doors' hand-off ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `/spec-resume <name|#N> [message]` re-enters and acts on the
message, and the authoring doors offer it for a `#N` that already has a spec.
Proven by the skill-content tests and one manual run.

## Tasks

- [ ] Write `packages/common/assets/skills/spec-resume/SKILL.md`: run
      `spec-env resume`. On a refusal, emit the `⏸` block. Bring the review
      server up from the primary checkout (as `/spec-start` 2b), provision if
      missing, `cd` in, and confirm with `spec-env resolve`.
- [ ] In the same skill, show the blocker first. Then interpret the message
      (overview Decision 3): a question gets an answer from the spec, new work
      gets tasks plus a Changelog line and is then built under `/spec-next`'s
      gate and review page, and an out-of-scope message gets the kind-routing
      proposal. Clear a blocker per Decision 9. With no message, report and
      stop.
- [ ] Report fields: `Tracker` · `Spec` · `Worktree` (entered or provisioned)
      · `Built` (when it built) · `Notes` (blocker shown or cleared) ·
      `Follow-ups` · `Next`.
- [ ] `/spec`, `/spec-bug` and `/spec-hotfix` Phase 0 step 1: replace "stop and
      point at that spec" with an offer of `/spec-resume #N <rest of message>`,
      confirm-first, invoking it in-session on a yes.
- [ ] Register the skill everywhere skills are listed (init manifest, managed
      skill list, `.claude/skills` sync), and add rows to `spec-planning.md`'s
      table and `CLAUDE.md`'s workflow paragraph.
- [ ] Tests: the skill is installed by `init`/`update`, and the doors' text
      names `/spec-resume`. Run `pnpm test`, green. Manual: resume a spec whose
      worktree has been removed.
