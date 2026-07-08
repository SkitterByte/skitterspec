# `env.config.json` — per-spec isolation config

Opt-in config for the `/spec-env` · `/spec-env-down` isolation skills (git
worktree + namespaced Docker stack + an optional opener per in-progress spec).

**Adopt it** by copying `env.config.json.example` → `env.config.json` in this
folder and editing the values. While `env.config.json` is absent the feature is
simply unused — every skill behaves exactly as it does today.

The loader (`src/env/config.js` → `loadEnvConfig`) merges your file over the
frozen defaults below and returns `{ config, present }`; `present:false` means
no live `env.config.json` was found.

## Fields

```jsonc
{
  // Where sibling worktrees are created and how their dirs are named.
  "worktree": {
    "root": "../{repo}-wt",   // dir that holds all spec worktrees; sibling of
                              // the primary checkout, never nested inside it.
    "folderPattern": "{slug}" // per-spec worktree dir name.
  },

  // Per-spec Docker stack. COMPOSE_PROJECT_NAME namespaces containers,
  // networks, and named volumes; PORT_OFFSET shifts the spec's port block.
  "docker": {
    "enabled": true,
    "composeFile": "docker-compose.yml",
    "projectNamePattern": "{repoSlug}_{slug}", // → COMPOSE_PROJECT_NAME
    "portBase": 3000,          // first port of slot 0's block
    "portsPerSpec": 10,        // block width; slot n → portBase + n*portsPerSpec
    "envFile": ".env",         // written into the worktree
    "backupCommand": ""        // optional pre-teardown backup (e.g. pg_dump);
                              // empty = no backup, volumes dropped directly.
  },

  // Optional, editor/terminal-agnostic opener run after `spec-env up`. The
  // template is expanded with {worktreePath}, {slug}, {branch}, {projectName},
  // {portOffset}. Empty = nothing is opened (the path is just printed).
  // Examples: "code {worktreePath}", "tmux new-window -c {worktreePath}",
  // or a "warp://..." deeplink for Warp users.
  "open": {
    "command": ""
  },

  // Machine-local slot registry (spec → slot index). Resolved against the
  // primary checkout root, shared by all worktrees, gitignored.
  "registry": ".spec-env/registry.json",

  // When true and specs/.core/linear.config.json is present, derive branch
  // names from Linear's branch.pattern so pushing fires Linear's GitHub
  // automation. Otherwise branches fall back to {type}/{slug}.
  "linkLinear": true,

  // Teardown safety. --force overrides both.
  "guards": {
    "refuseTeardownIfDirty": true,
    "refuseTeardownIfUnpushed": true
  }
}
```

## Token expansion

- `{repo}` — primary checkout dir basename (e.g. `skitterspec`).
- `{repoSlug}` — `{repo}` lower-cased, non-alphanumerics collapsed to `-`
  (safe for a `COMPOSE_PROJECT_NAME`).
- `{slug}` — the spec slug (folder name minus its `feat-`/`bug-` prefix).
