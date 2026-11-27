# Commit Trailers

This extends `commit-messages.md`. It adds one trailer, `Refs:`: the Azure Boards
issue that **this commit's own changes** belong to, written as the **last**
trailer.

```
fix(sync): verify no longer flags every update

- Key the apply read-back by ref, resolving id via the projection

Release-Note: Pushing a spec whose phases already exist no longer
reports every one of them as a possible stale reference.

Refs: AB#29
```

Get the value from the engine. Never read it off a spec by hand:

```
{{exec}} skitterspec-azure-boards spec-sync ref
```

Bare, it answers **from the branch**, which is correct when you commit that
branch's own work. That is nearly always.

**`/spec` closes the usual way in** for a mismatch. Where isolation is
configured, it writes each new spec in that spec's own worktree, so the branch
and the commit's subject match and the **bare** command is then correct.

**Without isolation the split is still real.** A spec written part-way through
another spec lands on the branch you are standing on, so name it instead:

```
{{exec}} skitterspec-azure-boards spec-sync ref feat-distance-prescriptions
```

An unknown spec name fails rather than falling back to the branch. A spec
written in **another spec's worktree** is still the thing to avoid: it lives on
that branch and is cancelled along with it.

## Rules

- **The ref names the commit's subject, not your location.** When they
  disagree, the subject wins: `spec-sync ref <spec>`.
- **Omit the trailer when there is no ref.** `spec-sync ref` exits non-zero and
  prints nothing. Never invent a ref, and never write `Refs: none`.
- **One ref per commit.** Work that spans two tickets is two commits.
- **Never use Boards' closing keywords** (`Fixes AB#n`, `Fixed AB#n`,
  `Closes AB#n` and their forms). Where a repo is wired to Boards, they complete
  the work item when the commit is scanned, but a ticket moves when its work is
  **released**. A bare `Refs: AB#n` carries no keyword and stays inert.
- **Leave a blank line before it**, as with `Release-Note:`, and put it **after**
  `Release-Note:` when both are present.
- **A hotfix carry ends one line later.** `spec-env hotfix land` picks with
  `-x`, so every commit it carries onto the base branch or an `--also` tag
  ends with `(cherry picked from commit <sha>)`, after `Refs:`. That line is
  expected: it names the hotfix commit the change came from. Leave it.

Under PR landing, every trailer survives a merge commit. A squash keeps them
only if the squash message keeps the commit bodies. For a squashed
integration-to-release merge, point `spec-sync released <range>` at the
integration branch.

---

Why the trailer exists, and how each merge style treats it:
[docs/rationale/commit-trailers.md](https://github.com/SkitterByte/skitterspec/blob/main/docs/rationale/commit-trailers.md).
