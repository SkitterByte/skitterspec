---
github_issue_id: "#57"
---

# Phase 2 — `release deployed` moves stories along the ladder ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** On Azure, `release deployed <tag> <env> --apply` moves the release's
finished stories to the `release.stages` rung with that key, forward-only
unless `--rollback`, after validating every rung state. Proven by kit and
adapter tests.

## Tasks

- [ ] Azure `config.js`: read `release.stages` from the file (array of
      `{ key, state }`, keys unique, hard error when malformed), matching
      Linear's `mergeReleaseStages`.
- [ ] provider-kit: add a pure ladder-order helper. Given the rungs, a
      ticket's current state, the target key and `rollback`, it returns
      `move | skip-later | already`.
- [ ] provider-kit `releases.js` `deployed`:
      - look up the rung for `envKey`; with none, print one line and move no
        tickets;
      - run `partitionStageMoves` over the attach set;
      - pass the rung and `rollback` to `releaseStage`;
      - print moved, later and excluded counts with refs;
      - add `--rollback` to the flags and usage.
- [ ] Azure `api.js` `releaseStage`:
      - validate the rung states against the story type's states before any
        write, and refuse with "nothing written" otherwise;
      - batch-read `System.State`;
      - apply the ladder helper, then PATCH `System.State` on the movers;
      - keep the existing `deployedField` path.
- [ ] Tests:
      - forward move;
      - a ticket on a later rung is skipped and named;
      - `--rollback` moves it back;
      - an env with no rung moves no tickets;
      - an unknown rung state refuses with nothing written;
      - an unfinished spec is excluded;
      - Deployed field and ladder both configured;
      - stays silent: no `release.stages` behaves exactly as today.
- [ ] Docs:
      - `azure-boards.config.md`: replace "never deployment stages" with the
        ladder (Resolved category, join by key, forward-only, `--rollback`);
      - `SETUP.md` §4b: add Groomed (Proposed) and the rung states.
- [ ] Run `pnpm test`. Green before the phase is done.
