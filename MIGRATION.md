# Migration guide

## `@skitterbyte/skitterspec` v1 → v2 (tracker-free base)

**v2 of the base package is tracker-free.** The Linear hybrid-sync feature — the
`/spec-status`, `/spec-pull`, `/spec-push` skills, the `spec-sync` CLI, the
Linear-aware steps of `/spec` and `/spec-go`, and the `linear.config.*`
templates — moved out of `@skitterbyte/skitterspec` into a separate **superset**
distribution, `@skitterbyte/skitterspec-linear`. You now install exactly one:

| If you… | Install |
|---------|---------|
| don't sync specs to a tracker | `@skitterbyte/skitterspec` (v2) |
| use (or want) Linear sync | `@skitterbyte/skitterspec-linear` |

Everything else — the spec lifecycle and per-spec isolation — is unchanged and
present in **both**.

### If you did NOT use Linear sync

Nothing to do. Upgrade to v2 and re-run `init` (or `update`) as usual. The base
never installed the Linear skills for you, so there's nothing to remove.

### If you DID use Linear sync

Switching is one install plus a re-`init`:

1. **Install the superset** (in place of the base):

   ```sh
   npm rm @skitterbyte/skitterspec        # if it was a dependency
   npx @skitterbyte/skitterspec-linear init
   ```

2. **Re-run `init`.** It re-installs the shared skills (now composed with the
   Linear steps) and the three sync skills, and re-scaffolds the config
   templates. Your existing files are preserved — `init` never overwrites without
   `--force`.

3. **Your config is unchanged.** The live config path is still
   `specs/.core/linear.config.json`, and the committed base sidecars under
   `specs/.core/linear-base/` are read as-is. No re-linking, no re-sync.

That's it — `/spec-status`, `/spec-pull`, `/spec-push`, and `skitterspec-linear
spec-sync …` work exactly as before.

### One config note — branch naming

Embedding the Linear identifier in a worktree branch name is now configured in the
**isolation** config, not the Linear config. In `specs/.core/env.config.json` set:

```jsonc
"branch": { "pattern": "{identifier}-{slug}", "identifierField": "linear_identifier" }
```

If you don't need the id in branch names, leave the default `{type}/{slug}` — the
old implicit Linear-branch behaviour is off unless you opt in this way. (This is
the only behavioural change beyond the package split.)

## Why the split

The base couldn't ship without a specific tracker's fingerprints baked into shared
skills and a `src/sync/` engine. Extracting the provider makes the base a clean,
tracker-free workflow and lets a new provider (e.g. Jira) ship as another superset
over the same base — without re-patching the base. See
`specs/complete/feat-extract-ticketing-provider/` for the full rationale.
