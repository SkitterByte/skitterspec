# `env.config.json` — per-spec isolation config

Opt-in config for per-spec isolation (git worktree + optional namespaced Docker
stack + an optional opener per in-progress spec), driven by `/spec-go` and the
`/spec-env` · `/spec-env-down` skills.

**Once this file is present, isolation is the default policy:** `/spec-go` gives
**every** in-progress spec its own git worktree automatically. Docker is a **per-
spec escalation** — a spec brings up a stack only when its `> **Stack:**` header
is `worktree + docker` (set at `/spec` when it touches the DB / stateful
services). A `worktree`-only spec takes no registry slot, no port block, and no
`.env`.

**Adopt it** with `skitterspec init --isolation` (or copy
`env.config.json.example` → `env.config.json` here) and edit the values. While
`env.config.json` is absent the feature is simply unused — every skill behaves
exactly as it does today.

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
    // Master switch: "is Docker escalation available on this project?" — NOT
    // "always run Docker". true = specs MAY escalate (a spec still needs
    // `Stack: worktree + docker` to actually get a stack); the default stack is
    // worktree-only. false = every spec is worktree-only and the escalation is
    // hidden. (Was "always provision Docker" in the pre-Stack engine.)
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
