# Split the docs site, and document Linear setup end to end

> **Type:** Feature
> **Name:** feat-docs-site-split (the spec folder name — the handle you paste into `/spec-go`)
> **Status:** In Progress — Phase 1 (started 2026-09-02)
> **Author:** Reuben Greaves
> **Developer:** Reuben Greaves
> **Raised:** 2026-09-02
> **Area:** docs/index.html, docs/linear.html (new), docs/README.md
> **Stack:** worktree

## Problem

`docs/index.html` is the GitHub Pages site and the only page there is. One
~1000-line file serves two audiences: someone evaluating the tracker-free base,
and someone wiring up Linear. The base reader wades through Linear content they
will never use.

Its setup story is also four majors out of date. `docs/README.md` records the
content as verified against **skitterspec v13 / skitterspec-linear v6**; the
shipped versions are **16.5.2 / 10.4.0**. Concretely the page never mentions:

- `/spec-linear-setup` — the interview that writes the config
- `spec-sync credentials set` — the API key, stored outside the conversation
- `spec-sync doctor [--check-remote]` — checking that a setup actually works
- `spec-sync retarget` — repairing stamps after a team rename
- `/spec-sync` — the repo-wide operations skill

Its "Get started" still says *"two files stand between you"* and walks the reader
through hand-writing `linear.config.json` — the path the interview replaced, and
the one that skips the workflow-state check.

## Decisions

1. **Two pages: `index.html` (landing + base) and `linear.html` (the superset).**
   Rejected a three-page split with a thin chooser: it costs every visitor a
   click before any substance, and the landing page would have to carry the pitch
   with nothing behind it.
2. **`index.html` keeps its narrative and gains a base setup section.** The loop,
   the walkthrough and the command reference stay; a proper base "Get started"
   is added (`npx @skitterbyte/skitterspec init`, the `specs/` lifecycle,
   isolation) plus a clear hand-off to `linear.html`.
3. **The command reference stays whole on `index.html`.** Rejected moving the
   Linear rows to `linear.html`: one at-a-glance table of every skill is among
   the page's better features, and splitting it means neither page answers "what
   are all the commands?".
4. **`linear.html` leads with `/spec-linear-setup`; the hand-written config is a clearly-secondary fallback.**
   Only the interview validates the workflow-state names, and an unrecognised state is the
   silent failure that matters — Linear ignores it, the push looks clean, and the mirror never
   moves. Rejected showing both as equal routes for exactly that reason; rejected dropping the
   manual path entirely, because someone evaluating the tool on GitHub should still be able to
   see what the config looks like.
5. **The audit is a pass, not a rewrite.** Every one of the 13 skills the page
   names still exists and nothing retired is referenced, so the staleness is
   omission rather than error. Verified by grepping the page's `/spec*` mentions
   against `.claude/skills/`.
6. **The API key is never requested in-page.** `linear.html` points at
   `skitterspec spec-sync credentials set` and says to run it in your own
   terminal, matching what the CLI itself prints.
7. **No build step, no dependencies.** `linear.html` is self-contained like
   `index.html` — inline CSS/JS, inlined favicon, its own `og:`/`twitter:` tags
   and canonical URL. Rejected extracting shared CSS into a file: a second HTTP
   request and a shared asset to keep in sync, for two pages.

## Solution overview

```
docs/
  index.html    landing + the base distribution, end to end
  linear.html   the Linear superset: set up, check, fix
  README.md     updated — two pages, how to preview and deploy each
```

`linear.html` runs the whole path in order, which is the thing no page currently
does:

1. **A new Linear** — workspace, the team this repo files into, and where the
   team id comes from.
2. **Install** — `@skitterbyte/skitterspec-linear` (this **or** the base, never
   both), and connect the Linear MCP server.
3. **Configure** — `/spec-linear-setup`, what it asks and why each answer
   matters; the hand-written config below it as a fallback.
4. **The API key** — `spec-sync credentials set`, run in your own terminal;
   what `auth.keyEnv` is for when a generic key would otherwise shadow it.
5. **Check** — `spec-sync doctor`, then `--check-remote` to prove the team
   resolves and the key is accepted.
6. **Fix** — `spec-sync retarget` after a team rename; `doctor`'s own rows name
   the command for everything else.
7. **Everyday sync** — `/spec-status`, `/spec-push`, `/spec-sync`.

## Impact

| Surface | Change | Detail |
|---------|--------|--------|
| Route/UI | add | `docs/linear.html` — the Linear superset page |
| Route/UI | update | `docs/index.html` — base setup section, nav, Linear hand-off |
| Docs | update | `docs/README.md` — two pages, preview + deploy |

No package, CLI or skill changes — `docs/` sits outside the `packages/*`
workspace glob, so nothing here affects `pnpm install` or the release tooling.

## Phases

Each phase lives in its own file in this folder. Status: ⬜ not started ·
🔄 in progress · ✅ done.

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Carve out `linear.html` and cross-link the two | ✅ | [01-split.md](01-split.md) |
| 2 | The full setup path on `linear.html` | ⬜ | [02-setup-path.md](02-setup-path.md) |
| 3 | Refresh `index.html` and the docs README | ⬜ | [03-base-and-readme.md](03-base-and-readme.md) |

## Open questions

- [ ] None.

## State log

| Date | Status | Folder | By |
|------|--------|--------|----|
| 2026-09-02 | Ready | backlog | Reuben Greaves |
| 2026-09-02 | In Progress | in-progress | Reuben Greaves |

## Changelog

- 2026-09-02 — Spec created. Audit found the page stale by omission only: all 13
  skills it names still exist, and nothing retired is referenced.
- 2026-09-02 — Phase 1 done. `index.html` 997 → 891 lines; `linear.html` is
  685. The `#linear` id stays on the base page as a pointer section, so any
  existing link to `…/#linear` still lands somewhere sensible; the moved
  section is `#why` on the new page.
- 2026-09-02 — Scope found during the phase: `docs/linear.html` had to be
  added to `docs-claims.test.js`'s `SURFACES`, and the standalone checks are
  now four permanent tests. Splitting one page into two turns every in-page
  anchor into a possible cross-page link, and a dead one fails silently.
  Verified non-vacuous by injecting a dead anchor and watching it fail.
