<!--
Injected into the worktree-provisioning step of /spec-bug and /spec-hotfix.
Both carried these two bullets byte-identically apart from one backtick, which
is exactly the drift that comes of maintaining the same words twice.

NOT shared with /spec-start, deliberately: its provisioning section hands off to a
new session rather than acting on the worktree, so its wording genuinely differs
and merging them would flatten a real distinction.
-->
- **Bootstrap the worktree.** A fresh worktree has no installed dependencies and
  none of the repo's gitignored files (`.env`, local overrides). Run the printed
  `in the worktree, run:` steps (file seeding, then `setup`) in order, before
  anything else.
- **Trust the worktree for this session.** The engine wrote the printed
  `trusted:` root into `.claude/settings.local.json`, but it won't hot-reload now
  — run `/add-dir <trusted root>` before editing into the worktree, or the first
  edits will prompt.
