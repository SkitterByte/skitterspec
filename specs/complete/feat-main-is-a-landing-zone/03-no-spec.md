---
linear_issue_id: "SKS-342"
---

# Phase 3 — `/no-spec`, the lane for work with no spec ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `/no-spec <name>` gives mechanical work a branch, a worktree, a review
page and a landing — with no spec document anywhere — so the guard in phase 4 is
a push rather than a wall.

## Tasks

- [x] Add the `nospec` button set to `BUTTON_SETS` in
      `packages/common/src/env/review.js`: `commit-land`, `commit`, `changes`,
      `discuss`. The comment records why reusing `refresh` was rejected.
- [x] Add `commit-land` to `VERDICTS` and to the `COMMITTING` list — it commits,
      so the open-comment block follows for free. Documented at its definition:
      one of the two readings of a shared `commit` destroys a worktree.
- [x] Render it on the page — button element, `verdictBtns`, `COMMITTERS`,
      `OFFERS`, `LABELS`, `TITLES`, `SAID` and the tinted-edge CSS. The
      `file://` command rows derive from `OFFERED`, so they followed for free.
- [x] Teach the registry a **specless** map (`recordSpecless`,
      `forgetSpecless`, `isSpecless`, `speclessNames`), carried through
      `allocateSlot` and `freeSlot`, and written to disk **only when non-empty**
      so an untouched project's registry file is byte-identical.
- [x] Teach `resolve.js`: `resolveSpecless()` returns the same shape with the
      document fields null and `specless: true`, and `resolveSpec` falls back to
      it **only** when the caller passes a map naming that name. `allSpecs`
      lists them, since no folder scan ever could.
- [x] Thread the map through `cli.js` — `speclessMap()` with the cannot-tell
      wrapper, `resolveSpecWithWorktree`, and all three `allSpecs` calls. A
      malformed registry resolves as if there were none.
- [x] Add `spec-env nospec <name>` — records first, then plans. Refuses a
      non-kebab name and a name that is already a spec. Keeps the `setup`
      commands, which is the opposite call from `/spec --docs`.
- [x] Mark specless entries in `spec-env status` (`(no spec)`) and in
      `spec-env resolve` (`(no spec)` rather than `(null)`).
- [x] Forget the record in teardown, alongside freeing the slot.
- [x] Write `packages/common/assets/skills/no-spec/SKILL.md`, model-invocable,
      with the report block, the `nospec` banner and the four routes.
- [x] Register it: the `spec-planning.md` skill table plus a paragraph of
      reasoning, `spec-init`'s skill enumeration, three READMEs, `docs/index.html`
      (chip **and** command table), `docs/linear.html`'s installed count, the
      report-contract list, and the `spec-env` verb lists in `--help`,
      `spec-planning.md` and `env.config.md`.
- [x] ~~Ship it through `init.js`.~~ **Nothing to do** — `listSkills()` reads the
      assets directory, so a new skill ships by existing. Confirmed by
      `pnpm relink` picking it up unprompted.
- [x] Tests (`env-specless.test.js`, 19): the registry key, idempotence,
      carry-through, the disk shape, resolution, the fallback's positive signal,
      listing, and the verdict/button-set wiring.
- [x] Tests (`cli-spec-env-nospec.test.js`, 10): recording, the setup commands,
      idempotence, both refusals, resolution vs a typo, and the `--json` shape.
- [x] Tests (`assets-no-spec.test.js`, 23): every load-bearing sentence in the
      skill, plus its registration in `spec-planning.md`.
- [x] Tests (stays-silent): an untouched registry keeps its exact shape; a
      registry written before this key existed reads as no specless branches; a
      non-object value is ignored; `resolveSpec`/`allSpecs` with no map behave
      exactly as before; a Docker spec provisioned beside a specless branch does
      not erase it; and the skill refuses rather than working in place when
      isolation is absent.
- [x] Run the project's test command — **3157 pass, 0 fail** (`node --test`).

## Notes

`refresh` (`review.js`) is nearly this set and was rejected for it: reusing plain
`commit` to mean "commit, land and tear down" is the one-word-two-meanings
problem the file already refuses for `commit-start`.

The branch is `chore/{slug}` — `branch.pattern` already carries `{type}`, so no
config change was needed.

**The suite found four registrations this phase would otherwise have missed**:
`/spec-reviewed` must name every verdict word, `spec-init` must count its own
skills, every published surface must list every command it ships, and every
dispatched verb must be documented. None were in the task list.
