# `env.config.json` — per-spec isolation config

Opt-in config for per-spec isolation (git worktree + optional namespaced Docker
stack + host dev servers + a front-door proxy + an optional opener per
in-progress spec). Provisioning is folded into `/spec-go`, teardown into
`/spec-complete` · `/spec-cancel`, and traffic diversion is `/spec-connect`; the
`skitterspec spec-env <up|down|dev|connect|integrate>` CLI is the engine beneath
them.

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

  // Host dev servers `spec-env dev up <spec>` starts on the spec's port block
  // (for apps that run via `pnpm dev` on the host, not inside the Docker stack).
  // An array so UI + API (or more) are supervised independently; [] = none.
  // Each entry:
  //   name       label used in logs/pid files (.spec-env/{logs,pids}/<spec>-<name>).
  //   command    the launch command, run detached in the worktree. {portVar} and
  //              {port} expand to the process's resolved port.
  //   portVar    env var the command reads for its port; injected into its env.
  //              Process i in the block gets portBase + slot*portsPerSpec + i.
  //   health     optional URL polled until it answers before reporting ready;
  //              {portVar}/{port} expand here too. Omit for no health gate.
  //   frontPort  optional canonical origin this process fronts (e.g. 3000 for the
  //              UI, 8080 for the API) — used by the proxy to route to it.
  "dev": [],

  // Front-door proxy for `spec-env connect <spec>` — a small bundled Node
  // reverse proxy (no external install) that exposes ONE connected spec's
  // frontPort dev servers on the canonical ports. Exclusive: one target at a
  // time. `connect main` stops it so the primary checkout owns the ports again.
  "proxy": {
    "enabled": true,        // false = the connect command is unavailable
    "host": "127.0.0.1"     // bind host for the canonical ports
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

  // Git branch naming, provider-neutral. `pattern` expands {type} and {slug}
  // (e.g. "feat/add-widget"). When a ticketing provider is linked and you want
  // tracker ids in branch names, use {identifier} in the pattern and point
  // `identifierField` at the 00-overview.md frontmatter field the provider
  // writes the id into — pushing that branch can then fire the tracker's
  // automation. Empty `identifierField` (or a spec missing that field) makes a
  // pattern with {identifier} fall back to {type}/{slug}.
  "branch": {
    "pattern": "{type}/{slug}",
    "identifierField": ""
  },

  // Integration base branch — the branch specs fork from and land back onto
  // (used by the teardown "merged?" guard and, later, the integrate step).
  // Empty = auto-detect: origin/HEAD → main → master. Set it when your default
  // branch isn't discoverable (e.g. no remote) or differs (trunk, develop).
  "baseBranch": "",

  // Teardown safety. --force overrides both. refuseTeardownIfUnpushed only
  // blocks when the commits are ALSO unmerged into the base branch — a branch
  // already landed on base tears down (and its branch is deleted) without
  // --force, even with no remote.
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
