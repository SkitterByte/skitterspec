# Migration guide

## `@skitterbyte/skitterspec` v2 → v3 (slimmer surface + local traffic diversion)

**v3 shrinks the everyday command surface to five verbs — `spec → go → connect →
commit → complete` — by folding provisioning, teardown, and grooming into the
lifecycle skills, and adds `/spec-connect` for testing a worktree at your normal
`localhost` URL.** (`@skitterbyte/skitterspec-linear` moves to v2.0.0 in lockstep.)

### Removed skills (breaking) → where they went

| Removed skill | Replaced by |
|---------------|-------------|
| `/spec-env` | **Automatic in `/spec-go`** — it provisions the worktree and (with your OK) starts the spec's dev servers. Escalate Docker later with the CLI: `skitterspec spec-env up <name>`. |
| `/spec-env-down` | **Folded into `/spec-complete` and `/spec-cancel`** — they tear the environment down (dev servers, worktree, stack, slot) as part of finishing/abandoning a spec. |
| `/spec-ready` | **Folded into `/spec`** — grilling now writes a `Ready` spec directly (or `Draft` if you deliberately leave open questions). Go straight to `/spec-go`. |

The **`skitterspec spec-env` CLI engine stays** (`up`, `down`, `dev`, `connect`,
`integrate`, `status`, `resolve`) — only the three *skills* were removed. Anything
that scripted those CLI verbs keeps working.

### New — `/spec-connect` and two config blocks

- **`/spec-connect <name>`** points your canonical `localhost` ports at a spec's
  running dev servers (so you can test a worktree's UI/API at the normal URL);
  `/spec-connect main` hands the ports back. It's a small bundled Node reverse
  proxy — no external install. Exclusive: one spec exposed at a time.
- **`env.config.json` gains `dev` and `proxy` blocks.** `dev` lists the host dev
  servers `/spec-go` starts (`{ name, command, portVar, health?, frontPort? }`);
  `proxy` configures the front-door proxy (`{ enabled, host }`). Both default to
  off/empty, so existing projects are unaffected until you fill `dev` in.

### What to do

1. **Upgrade and re-run `init`** (or `update`): `npx @skitterbyte/skitterspec
   update`. It stops installing the three removed skills, installs `/spec-connect`,
   and refreshes the CLAUDE.md section + `spec-planning` rule. Your specs and
   `env.config.json` are untouched.
2. **Remove muscle memory for the old commands** — use `/spec-go` to bring a spec
   up, `/spec-complete`/`/spec-cancel` to tear it down, and `/spec` (no separate
   `/spec-ready`) to reach a Ready spec.
3. **To test UI/API worktrees:** add a `dev` block to `env.config.json` (see
   `specs/.core/env.config.md`), then `/spec-go` → `/spec-connect <name>`.

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
