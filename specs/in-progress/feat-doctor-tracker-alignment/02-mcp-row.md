# Phase 2 — The MCP row and the cross-check ⬜

> Spec: [00-overview.md](00-overview.md) · **Status:** Not started

**Goal:** `doctor --mcp <file>` proves the MCP server, the API key and the config
all name the same workspace, team and project — and says so loudly when they
don't, without changing anything.

## Tasks

- [ ] Add `readOrganization()` to the API adapter, returning `{ id, name, urlKey }`
      — the API key's workspace identity. Cover it in `api.test.js`.
- [ ] Add the `--mcp <file>` flag to `spec-sync doctor`, resolved and read like
      `--workspace-states` (path resolution, a clear refusal for a missing or
      malformed file — reuse the wording `verify --stored` already uses).
- [ ] Carry the file into `state.mcp` as data: `{ workspace, team, project }`.
      Never throw on a partial file — a field the skill could not fetch is
      absent, and absent means unchecked, not mismatched.
- [ ] Add `mcpCheck` to `doctor.js`:
      - no file → `skipped`, naming the flag;
      - every id present and equal → `ok`, naming the workspace;
      - any id present on both sides and different → `broken`, printing **both**
        identities and pointing at `/spec-linear-setup`.
- [ ] Compare **ids only** (organization, team, project). Add a test that a
      renamed workspace or team — same id, different name — is `ok`.
- [ ] Name the blind spot in a comment: the file is a snapshot the skill took, so
      `ok` means the two agreed *when it was fetched*; and a field absent from the
      file is unchecked, which is why absence never produces `broken`.
- [ ] **Stays-silent tests** (see `.claude/rules/negative-checks.md`): no `--mcp`
      file leaves the run `ok`; a file naming only the workspace does not accuse
      over the team it says nothing about; a repo with no API key still reports
      the config-vs-MCP comparison rather than skipping the row wholesale.
- [ ] Counterweight test: differing workspace ids exit 1 and print both, and the
      detail never contains an API key or a token.
- [ ] Add/extend tests covering this phase; run the project's typecheck and
      test commands (see `.claude/rules/spec-planning.md`) — green before the
      phase is done.

## Notes

Three sources, so state which pair a mismatch is between — "the API key's
workspace vs the MCP server's", not a bare "mismatch". With no key resolvable
there are still two sources worth comparing (config vs MCP), and that is the
case `skitterload` is actually in.

`doctor.js` stays pure: the file is read in `cli-sync.js` and handed over as
data, exactly like the workspace states.
