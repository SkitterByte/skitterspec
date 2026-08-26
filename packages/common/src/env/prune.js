'use strict'

/**
 * Pure planner for `spec-env prune` — the orphaned-test-DB reaper.
 *
 * Per-spec isolation gives each Docker-escalated spec its own compose stack
 * namespaced by `{repoSlug}_{slug}`; the DB storage is a Docker named volume
 * (`{repoSlug}_{slug}_<volname>`). Those volumes only ever get dropped by an
 * explicit single-spec `spec-env down`, so they leak whenever that path is
 * skipped (declined/guard-aborted teardown, manual `git worktree remove`,
 * `--keep-volumes`). This planner reconciles the live namespace volumes against
 * the specs that are still live and returns the `docker volume rm` commands for
 * the orphans.
 *
 * **Liveness = an existing worktree, NOT the slot registry.** The registry is
 * exactly what goes stale (a declined teardown leaves both the slot and the
 * volume behind), so the caller derives `liveSlugs` from real worktrees and the
 * registry is only reconciled afterwards. See the spec Decisions.
 *
 * We never parse a slug out of an orphan. Instead we build a protected-prefix
 * set from the live slugs (`{repoSlug}_{slug}_`) and keep any volume matching
 * one — everything else in the `{repoSlug}_` namespace is an orphan. The
 * trailing `_` makes the slug match exact: slugs are kebab-case (`[a-z0-9-]`)
 * and `_` is the compose project/volume separator, so `add` never protects
 * `add-widget`.
 *
 * Side-effect free and deterministic: no `Date.now()` — the caller supplies
 * `now` (and per-volume `createdAt`) when age-gating.
 */

/**
 * @param {Array<string|{name:string,createdAt?:number|null}>} volumes
 *   live Docker volume names (or objects carrying `createdAt` epoch-ms for age
 *   gating). Plain strings are treated as unknown-age.
 * @param {Iterable<string>} liveSlugs  slugs of specs that still have a worktree.
 * @param {object} opts { repoSlug, olderThanDays?, now? }
 *   `repoSlug` (required) is the namespace prefix. `olderThanDays` (optional)
 *   keeps only orphans strictly older than the cutoff; when set, `now`
 *   (epoch-ms) is required and volumes of unknown age are conservatively kept.
 * @returns {{ orphans: Array<{name:string,createdAt:number|null}>, commands: string[] }}
 */
function planPrune(volumes, liveSlugs, opts = {}) {
  const { repoSlug, olderThanDays = null, now = null } = opts
  if (!repoSlug) throw new Error('planPrune: opts.repoSlug is required')

  const namespace = `${repoSlug}_`
  const live = liveSlugs instanceof Set ? liveSlugs : new Set(liveSlugs || [])
  const protectedPrefixes = [...live].map((slug) => `${repoSlug}_${slug}_`)

  let orphans = (volumes || [])
    .map((v) => (typeof v === 'string' ? { name: v, createdAt: null } : v))
    .filter((v) => {
      const name = v && v.name
      if (!name || !name.startsWith(namespace)) return false
      return !protectedPrefixes.some((p) => name.startsWith(p))
    })
    .map((v) => ({ name: v.name, createdAt: v.createdAt == null ? null : v.createdAt }))

  if (olderThanDays != null) {
    if (now == null) throw new Error('planPrune: olderThanDays requires opts.now')
    const cutoff = now - olderThanDays * 24 * 60 * 60 * 1000
    // Unknown age (createdAt == null) is kept — never drop what we can't date.
    orphans = orphans.filter((v) => v.createdAt != null && v.createdAt <= cutoff)
  }

  const commands = orphans.map((v) => `docker volume rm ${v.name}`)
  return { orphans, commands }
}

module.exports = { planPrune }
