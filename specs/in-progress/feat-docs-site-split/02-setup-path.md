# Phase 2 — The full setup path on `linear.html` ✅

> Spec: [00-overview.md](00-overview.md) · **Status:** Done

**Goal:** `linear.html` walks a reader from no Linear at all to a verified,
working mirror, and names the command for every failure along the way.

## Tasks

- [x] **New Linear** — workspace, the team this repo files into, and where the
      team id comes from. State the one-team-per-repo limit (see
      `linear.config.md`) rather than leaving it to be discovered.
- [x] **Install + MCP** — `npx @skitterbyte/skitterspec-linear init`, this **or**
      the base and never both; `claude mcp add --transport http linear …`, and
      that a newly added server only appears in `/mcp` after a restart.
- [x] **Configure** — lead with `/spec-linear-setup`: what it asks (which team,
      team-vs-project split, intake labels) and why each answer matters. Say that
      it validates the workflow-state names, and what goes wrong without that
      check: Linear ignores an unknown state, the push looks clean, the mirror
      never moves.
- [x] **Configure by hand** — the same config as a clearly-secondary fallback for
      anyone not in Claude Code, flagged as skipping the state check.
- [x] **The API key** — `skitterspec spec-sync credentials set`, run in your own
      terminal, never pasted into a conversation. Explain `auth.keyEnv` for the
      case where a generic `LINEAR_API_KEY` for another workspace would otherwise
      shadow this repo's key.
- [x] **Check** — `spec-sync doctor` for the four offline layers, then
      `--check-remote` to prove the team resolves and the key is accepted. Show
      real output, including a row that needs attention with its `fix` line.
- [x] **Fix** — `spec-sync retarget` for a renamed team (what breaks:
      `no Linear issue found for SKI-7`), and that `doctor` names the command for
      every other row.
- [x] **Everyday sync** — `/spec-status`, `/spec-push`, and `/spec-sync` for the
      repo-wide operations.
- [x] Verify every command shown is real: each `skitterspec spec-sync <verb>`
      must be a dispatched subcommand and each `/skill` must exist in
      `packages/linear/assets/skills/` or `packages/common/assets/skills/`.
- [x] Strip markup before matching in the command guards — the verb sits inside
      a syntax-highlighting `<span>`, so the first version matched nothing and
      passed vacuously.
- [x] Run the copy past `spec-sanitise` conventions — no emphasis or link
      straddling a line break in any markdown this spec touches.

## Notes

The page must not ask for an API key, offer to store one, or show a key-shaped
string in an example — the CLI itself refuses to take one in argv for the same
reason.

Output blocks should be pasted from real runs, not invented. `doctor` against a
repo with no key and `--check-remote` against a working one both produce useful,
honest examples.
