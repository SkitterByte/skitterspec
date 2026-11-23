## Spec workflow

Spec-driven development runs through the lifecycle **skills**. The everyday
loop is **`spec → start → next → commit → complete`**. Use **`/spec-diff`** to
read what a phase changed, and `/spec-connect` or `/spec-live` to try it in a
browser. `/spec-resume` goes back into a spec that was waiting, and
`/spec-park` records what it is waiting on. `/spec-tada` and `/spec-todo` recap
the day and plan the next one across projects.

- **Each phase ends on a review page**, listed as `local`, `network` (LAN) and
  `remote` (tailnet), with a `live:` line saying whether it is also running.
  Mark it up and press a verdict. `/spec-next` waits for that press, and a phase
  that ended owes one before the next is built. A newly written spec's page
  offers `Commit & Start` (`commit-start`).
- **Every skill ends with the same report block**: a verdict, a table, and
  `Next`.
- **Guards**: work never happens in the primary checkout on the base branch,
  and a session works only on its own project. Only a person can lift either
  guard (`/allow-main`, `/allow-project`).

The rules are in `.claude/rules/spec-planning.md` (lifecycle and guards),
`.claude/rules/spec-reports.md` (the report block) and
`.claude/rules/spec-format.md` (spec layout, which loads under `specs/`). This
project's typecheck and test commands are in
`.claude/rules/project-conventions.md`.
