---
linear_issue_id: "SKS-294"
---

# Phase 1 — A port per repo, stable across restarts ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** two repos on one machine stop competing for `7777`, and the port a
repo gets today is the port it gets tomorrow — so a link handed out yesterday
still resolves.

## Tasks

- [ ] Accept a string in `review.servePort` alongside the number it takes now.
      `"auto"` becomes the **default**; any other string is refused by name at
      config-load, like every other typed key (`config.js` `assign`).
- [ ] Derive the port purely: `PORT_BASE + hash(realpath(repoRoot)) % PORT_SPAN`,
      with both constants named and exported. No state on disk — the derivation
      must be reproducible from the path alone, because that is what makes the
      port survive a restart, a reboot, and a `--stop`.
- [ ] Resolve `realpath` once, so a symlinked spelling of one repo does not hash
      to a second port and hand out two different URLs for one tree.
- [ ] **Refuse on collision, still.** A hundred slots is a small chance of two
      repos landing together, not no chance, and the honest answer is the
      refusal that already exists. Improve its wording: name `servePort` as the
      durable fix, not only `--port` — `--port` moves you aside and breaks your
      links again, which is the bug this phase is closing.
- [ ] `spec-env review serve --status` reports the port **and how it was
      chosen** — derived, configured, or overridden by `--port` — so "why is this
      on 7742?" is answered by the tool rather than by reading the source.
- [ ] Update `specs/.core/env.config.md`'s `servePort` section: what `auto`
      means, the range, that an explicit number still wins, and that pinning one
      is what you do when you want a port you can memorise.
- [ ] **Name the one-time break.** A repo with no `servePort` set is on `7777`
      today and moves the first time it starts after this lands. Say so in the
      migration guide — a link open on a phone at that moment dies, once, and a
      re-render is the fix.
- [ ] Tests: the same path hashes to the same port across calls; two different
      paths in a sample do not all collide; a symlinked path resolves to the same
      port as its target; an explicit number bypasses derivation entirely;
      `--port` bypasses both; an unknown string is refused by name.
- [ ] Stays-silent test (`.claude/rules/negative-checks.md` rule 3): a repo that
      already pins `servePort` to a number sees **no** change in behaviour or
      output, and a repo with no isolation config is untouched.
- [ ] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

The derivation must not read the registry or any `.spec-env/` state. A port that
depends on a file is a port that changes when the file is deleted, and this
phase exists precisely so it does not change.
