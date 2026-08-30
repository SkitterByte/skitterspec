# Phase 3 — Make it the documented path ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** a new install is told to run the skill, and someone who cannot (or will
not) still has a manual walkthrough that works.

## Tasks

- [ ] Rewrite `SETUP.md` steps 3–4 to lead with `/spec-linear-setup`, keeping the
      manual "find your team id / copy the example" path below it as the explicit
      fallback (Decision 4) rather than deleting it.
- [ ] Document what setup validates — state names in particular — and why a
      rename would otherwise surface as a mirror that never moves.
- [ ] Point `init`'s post-install output at the skill, so the config step is
      discoverable from the terminal rather than only from a doc.
- [ ] Note the known limitation in `linear.config.md`: one team per repo, and
      initiatives unsupported, with the follow-on hook named
      (`list_projects` takes an `initiative` filter; `api.js:190` sends none).
- [ ] Add tests: `SETUP.md` names the skill, and still documents the manual path;
      `linear.config.md` states the one-team-per-repo limit. Extend the existing
      `assets.test.js` doc assertions. Run `node --test` — green before the phase
      is done.

## Notes

Keeping the manual path is the point of the phase, not a hedge: the CLI is usable
without Claude Code, and a setup story that only works inside one client would
make the package quietly client-locked.
