---
linear_issue_id: "SKS-256"
---

# Phase 2 — Pin the dev Node with `.nvmrc` and a guard test ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the Node version this repo is developed against is on the record, and
a test says so when it stops agreeing with what the manifests promise.

## Tasks

- [x] Extract `manifestEngines()` and `floorOf()` from
      `scripts/workflows.test.js` into `scripts/lib/engines.js` and require them
      from there. Two accusing checks reading the same floor should not read it
      two different ways.
- [x] Keep `scripts/workflows.test.js` green and unchanged in behaviour — the
      extraction is a move, not a rewrite.
- [x] Add `.nvmrc` containing `24.21.0` — the current Krypton LTS patch.
- [x] Add `scripts/toolchain.test.js` asserting the `.nvmrc` version satisfies
      the floor the manifests declare, via the shared helper. Hand-roll any
      remaining comparison; the repo is zero-dependency outside `prompts`.
- [x] Assert the root `packageManager` names a pnpm version, in the same file.
- [x] Per `.claude/rules/negative-checks.md`, this check **accuses** — it fails
      the suite and tells the user their config is wrong — so it needs both
      halves. Add the **stays-silent test**: feed it healthy-but-unusual
      `.nvmrc` content and assert it says nothing.
- [x] Write the blind-spot comment beside the check, naming what would fool it.
- [x] Run the project's test command — green before the phase is done.

## Notes

**The blind spot to name and cover.** `.nvmrc` is a loose format: `24.21.0`,
`v24.21.0`, a bare major `24`, a trailing newline, and an LTS codename
(`lts/krypton`) are all valid and all healthy. A naive parse accuses every one
of them but the first. The stays-silent test feeds those forms; the positive
test proves the check can still fire on a genuine mismatch. `floorOf()` already
has a sibling case worth copying — `workflows.test.js` tests that an unparseable
engines range yields **no floor rather than a wrong one**, which is the same
bias-the-unknown-toward-inaction rule this check needs.

`24.21.0` satisfies `>=22.13`, so the test is green from the moment it lands.

**What the extraction actually took.** `cmpVersion` and `lowest` came across
beside `manifestEngines`/`floorOf`: `lowest` is built on `cmpVersion`, and the
`.nvmrc` check needs `cmpVersion` too, so leaving them behind would have split
the version arithmetic across two files — the exact thing the extraction was
for. `scripts/lib/engines.js`, matching the `scripts/lib/` convention.

**The blind spot turned out to have teeth.** A bare major is not merely a
format to tolerate: nvm and fnm resolve `22` to the newest 22.x, which really
does satisfy `>=22.13`. Comparing it as the literal `22.0.0` would fail a pin
that is correct — so a pin less precise than the floor but agreeing on every
part it states reads `unknown`, never `below`. Only `below` accuses.

**The pin is not decorative on this machine.** Node here is provided by fnm,
which reads `.nvmrc` — so the pin takes effect locally even though nothing
asserts it does.

**The pin is deliberately not coupled to CI.** `ci.yml` tests a matrix
(`22.13`, `24`); `.nvmrc` records what a developer should be running locally.
They answer different questions and no test should assert they agree — that
would make bumping the local pin a CI change. Overview Decision 4 covers why
`devEngines.runtime`, which would actually enforce the pin, was not chosen.
