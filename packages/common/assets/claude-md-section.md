## Spec workflow

Spec-driven development runs through the lifecycle **skills** — use them so
structure and lifecycle stay consistent. The everyday loop is
**`spec → start → next → commit → complete`**, with **`/spec-diff`** to read what
a phase changed and `/spec-connect` when you want to test the spec in a browser.

**Skills vs commands.** The lifecycle skills are read by Claude, which exercises
judgment. `/spec-connect` and `/spec-live` are **slash commands** instead — each
pre-executes one `spec-env` verb and relays it, so only you can run them; a
skill that wants one will tell you to type it.

**Seeing the work.** A phase is built in its own worktree, so `git diff` in your
terminal answers about the base branch. **`/spec-diff`** renders that worktree's
diff as a self-contained HTML page you open locally — or publish, and read on a
phone. The diff never passes through the model, so the page costs no context
tokens however large it is; the optional written review is the part that costs,
and it is offered rather than assumed. `/spec-next` writes the page at the end of
every phase.

The skill table, the spec type/folder conventions and the per-spec isolation
model all live in **`.claude/rules/spec-planning.md`**, the canonical reference
every spec skill points at. Tailor its per-phase test commands to this stack.

**Release gating** *(only when `specs/.core/gating.config.json` exists)* — each
spec records whether it ships behind a feature flag, as
`> **Gating:** <flag name>` or `> **Gating:** none: <one-line reason>`. `/spec`,
`/spec-bug` and `/spec-hotfix` ask; `/spec-review`, `/spec-start` and
`/spec-complete` report a spec that has no answer, and never block over it.
`skitterspec gating check` lists them and always exits 0. The point is that the
question is **on the record**: a missing line is an oversight, a reason is a
decision. Skitterspec never reads your flag system — it asks and cites the doc
you point it at. Without that config, none of this appears.
