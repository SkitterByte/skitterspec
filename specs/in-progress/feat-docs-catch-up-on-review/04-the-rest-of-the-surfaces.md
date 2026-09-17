# Phase 4 — The surfaces the guard was not pointed at ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** the config reference, the example config, the CLAUDE section and the
unreleased migration entries are correct about the specs delivered *after* this
one was written — and the guard covers them, so the next addition cannot slip
the same way.

## Tasks

- [x] **Document `review.allowNetwork` and `review.allowRemote` in
      `specs/.core/env.config.md`.** It is the reference installed into every
      project, and the base README sends people there saying *every field* is
      documented — so two undocumented keys make that sentence false.
- [x] Add both keys to `specs/.core/env.config.json.example`, with the shipped
      defaults (`allowNetwork: true`, `allowRemote: false`).
- [x] **Correct the v22 migration entry.** It says *"What the server binds to is
      still chosen by `review.reader`"*, which stopped being true when the bind
      moved to `allowNetwork` — and v22 is **unreleased**, so that is a wrong
      claim about what is about to ship rather than a record of what once was.
      Add the two keys and `/spec-remote-review` to that entry, and the same to
      the linear v17 one.
- [x] **Bring `assets/claude-md-section.md` up to date** — the section `init`
      patches into a project's `CLAUDE.md`, and therefore the one Claude itself
      reads in every project that installs this. It still says *three buttons*,
      and carries no `/spec-remote-review`, no tier stack, no `live:` line and
      no `commit-start`.
- [x] Add `Commit & Start` to the base README's verdict table — four buttons
      there, five in the engine.
- [x] **Extend the positive config check to every surface that owes the keys**:
      `env.config.md`, `env.config.json.example` and the base README each claim
      completeness, so each is checked. One surface checked out of three is how
      this gap survived phases 1–3.
- [x] **Extend the negative check to `claude-md-section.md`** — it is a live
      claim surface, not a history, so a banned phrase there is the same failure
      as one in a README.
- [x] **Check the unreleased migration entries, using a positive signal.** An
      entry whose target version is **above** the version in that package's
      `package.json` describes a release that has not shipped, so it must be
      currently true; every older entry is history and is left alone. Read the
      shipped version from `package.json` rather than listing which entries are
      current.
- [x] **Stays-silent test** (rule 3): a *released* migration entry may say
      anything about how things used to work; the check must fire only on the
      unreleased ones. And a project that has not adopted isolation has no
      `env.config.md` at all — the check reads the shipped asset, not a
      project's copy.
- [x] Run the project's typecheck and test commands — green before the phase is
      done.

## Notes

**This phase exists because the guard was pointed at too few surfaces**, which
is the original problem one layer out. Phases 1–3 fixed the four documents the
spec named and checked `review.*` keys in exactly one of them; the four
documents added here were never in the list, so two config keys and a renamed
binding rule walked straight through.

Two of the five gaps are **worse than absence**, in the way phase 2 found on the
site: the migration guide states a binding rule that changed, and the CLAUDE
section is what Claude reads in every project that installs this.

**One assertion was written, fired, and removed** — requiring an unreleased
migration entry to name every `review.*` key. It accused the v22 entry for not
re-documenting `commitWith` and `required`, which shipped in v20 and v21. A
migration entry documents a **transition** and the check cannot tell which keys
are new in one, so demanding all of them makes an accurate entry fail: the exact
over-reach this spec exists to avoid. `env.config.md` is what guarantees every
key is documented somewhere authoritative; the guide's job is what *changed*. A
stays-silent test now asserts an unreleased entry need not re-document older
keys.

**And be straight about what actually found the bug.** No check here would have
caught *"What the server binds to is still chosen by `review.reader`"*. It is
not a removed name or a removed phrase — it is a sentence that was **true when
written** and made false by a later release, and nothing mechanical predicts
that. A person asking *"are we sure the docs are up to date?"* found it. It is
banned by name now so it cannot come back, which is all an explicit list can
ever do: close the door behind a mistake rather than predict the next one.

**A near-miss worth recording: one wrong claim, two wordings.** The site said
*"cannot reach your conversation"* and the CLAUDE section said *"cannot reach
**this** conversation"*. The substring ban caught one and walked past the other —
in the file Claude itself reads. That entry is a **regex** now, and the lesson is
the one decision 4 already implies: an explicit list must ban the *claim*, not
one phrasing of it.

**What is deliberately still absent, and why.** The superset README,
`docs/linear.html` and `packages/common/README.md` carry no `allowNetwork` /
`allowRemote`, and that is the delegation each states in its own text: the
superset README says the base documents the `review.*` keys, `linear.html`
defers to `index.html`, and the contributor README points at `env.config.md`.
Only the three surfaces that **claim completeness** owe the keys, which is what
`OWES_CONFIG_KEYS` encodes rather than leaves to judgement. The marketing site
describes the tiers in prose and names the command — naming JSON keys is not its
job.
