---
linear_identifier: "SKS-197"
linear_url: "https://linear.app/skitterbyte/issue/SKS-197/bug-a-remote-reader-is-handed-a-link-that-does-not-open"
linear_assignee_id: "f41dfb0a-797a-4710-bf94-fcde2781539f"
linear_assignee_name: "Skitter Byte"
---

# Bug: a remote reader is handed a link that does not open

> **Type:** Bug
> **Name:** bug-remote-reader-gets-a-dead-link (the spec folder name — the handle you paste into `/spec-start`)
> **Status:** In Progress — phase 1 green, phases 2-4 open
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-13
> **Area:** packages/common/src/cli.js, packages/common/src/env/{serve,config}.js, packages/common/assets/skills/{spec-diff,spec-next,spec-bug,spec-hotfix}/SKILL.md
> **Stack:** worktree

## Symptom

`feat-diff-reaches-the-reader` shipped to fix exactly one thing: a `file://` URL
is useless to a reader who is not at the machine that wrote it. Detection works —
the engine correctly reports `reader: remote (bridge session)`. But the offer a
remote reader actually receives is still a dead link plus homework:

```
reader: remote (bridge session)
open:   file:///…/feat-skill-report-contract.html   (will not open where you are reading)
serve:  skitterspec spec-env review serve --host 0.0.0.0
```

Reproduced on `feat-skill-report-contract` phase 1, 2026-09-13: the operator,
reading on a phone on the same wifi, got the `file://` link and asked why the
feature had not shipped. The server named on the second line works perfectly —
started by hand it serves the page over the LAN in 90KB — so every piece of the
fix exists and nothing connects them.

## Root cause

Not a defect in the code, but a decision that drew its line in the wrong place.
Decision 5 of `feat-diff-reaches-the-reader` reads:

> Reader detection decides the offer's wording, never the act. … **Nothing
> publishes on a detection.**

The reasoning is exactly right about **publishing**, which leaves a public page
this tooling cannot remove. It was then applied to **serving** as well — and
serving fails none of the tests that made publishing confirm-first. It is a local
process, ended by one flag, leaving nothing behind.

So `packages/common/src/cli.js:1697-1702` prints the `file://` URL and a command
for the operator to type, on the one branch where the engine has just established
the operator cannot use the first and should not have to type the second.

The prohibition was never load-bearing in tests either. The test named
`nothing is published or served on a detection`
(`packages/common/test/env-review-reader.test.js:224`) asserts only that no
`.url` and no `.publish.html` were written. **It never checks that nothing was
served.** The serving half of that sentence lived in prose alone.

## Security scope (asked during grooming, recorded because it drove the design)

Two things worth having on the record, having read `env/serve.js`:

- **Binding does not expose the machine.** `listen(port, '0.0.0.0')` binds one
  process on one port to all interfaces, exposing that server's routes and
  nothing else. `routeFor` rejects any path of more than one segment after the
  token and matches the segment against resolved spec folders, so there is no
  path traversal to the filesystem.
- **The token already exists and is sound.** `mintToken` takes 48 bits from
  `crypto.randomBytes`, minted only when binding beyond loopback, required as the
  first path segment, with a wrong token returning a flat 404 rather than a
  redirect so that probing does not confirm the server is there.

A path token is a **bearer capability**, not identity: whoever holds the URL is
the creator as far as the server is concerned. Per-reader authentication is not
proposed — it is a large mechanism for a threat model of "someone else on this
wifi scans ports", and the token already answers that. The real exposure is that
one token unlocks **every** spec with a worktree via the index, for as long as
the server runs. That is acceptable, and it is why phase 3 exists.

## Decisions

1. **Overturn decision 5 for serving, keep it for publishing.** Three cases, not
   two: loopback (free), LAN (cheap and reversible, so it gets a config key), and
   publish (unremovable, so it is always asked for). The old decision had one
   bucket marked "acts" and put serving in it.
2. **`review.serveOnRemote`, defaulting to `true`.** The operator who does not
   want a LAN listener started for them turns it off and gets today's output
   back, verbatim. A default of `false` would ship the fix switched off.
3. **The engine serves, not the skill.** `feat-diff-reaches-the-reader` decision 7
   put detection in the engine so it is testable and cannot drift across four
   skills. Acting on it belongs in the same place for the same reason.
4. **Auto-starting is what makes accountability mandatory.** Typed by hand, the
   operator knows a LAN listener is up. Started for them, nobody does — so the
   report must say so and teardown must end it. This is decision 5's instinct
   finding the thing it was actually right about.
5. **Never fatal, and never worse than today.** Every failure to serve — port
   busy, process will not come up, config absent — falls back to the exact
   current output. The bug being fixed is a dead link; the way to not make it
   worse is that the dead link remains the floor, not the ceiling.
6. **Pick the LAN address, do not print a guess as if it were known.** This
   machine reports three non-internal IPv4 addresses, two of them Parallels
   virtual adapters. Offering `10.37.129.2` to a phone reintroduces this exact
   bug, so ranking is part of the fix and not a refinement of it.

## Failing test (red)

`a remote reader is given a link that opens where they are` —
`packages/common/test/env-review-reader.test.js:273`. Scaffolds a repo with
`review.reader: remote` on a free port, runs `spec-env review`, and asserts the
`open:` line is an `http://` URL naming the spec.

```
node --test packages/common/test/env-review-reader.test.js
```

```
✖ a remote reader is given a link that opens where they are
  AssertionError: the offered link must be one the reader can open, not a path
  on this machine
  actual: '… open: file:///…/feat-alpha.html   (will not open where you are
          reading)\n  serve: skitterspec spec-env review serve --host 0.0.0.0\n'
  expected: /open: http:\/\/[^\s]+\/feat-alpha/
```

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Config key | add | `review.serveOnRemote` — default `true` |
| CLI command | update | `spec-env review` serves on a `remote` reader; `open:` becomes the served URL |
| CLI command | update | `spec-env review --json` gains `served` (url, port, token, whether this call started it) |
| CLI command | update | `spec-env down` stops an auto-started review server |
| Skill/rule | update | `/spec-diff`, `/spec-next`, `/spec-bug`, `/spec-hotfix` — the `remote` branch relays `open:` like every other branch |

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Serve on a remote reader | ✅ | [01-serve-on-remote.md](01-serve-on-remote.md) |
| 2 | Offer a LAN address that routes | ⬜ | [02-which-lan-address.md](02-which-lan-address.md) |
| 3 | Account for a server nobody started | ⬜ | [03-account-for-the-server.md](03-account-for-the-server.md) |
| 4 | Point the skills at the working line | ⬜ | [04-skills-relay-the-link.md](04-skills-relay-the-link.md) |

## Open questions

- [ ] None

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-13 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-13 — Bug reproduced; failing test added (red). Captured as a Bug rather
  than a feature because `feat-diff-reaches-the-reader` shipped complete and
  misses its own stated goal on the one path it was written for.
- 2026-09-13 — Grooming established that the binding exposes the server and not
  the machine, and that the path token is already sound, so no authentication
  work is in scope. What that surfaced instead is that an auto-started server is
  one nobody remembers to stop — which became phase 3.
- 2026-09-13 — Phase 1 green; red test passes and the full suite is 2020 pass /
  0 fail. Verified against the real worktree, not only the fixtures: the engine
  printed `open: http://192.168.0.241:7777/…/bug-remote-reader-gets-a-dead-link`
  and adopted the server already running rather than minting a second token.
- 2026-09-13 — Making `specEnvReview` async broke four test files that captured
  its stdout in-process, which is how the suite learned that `node --test` runs
  each file as a child emitting TAP on the same stream. Recorded in phase 1's
  Outcome. No production behaviour was changed to accommodate it.
