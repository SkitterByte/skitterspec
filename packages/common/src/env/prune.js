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

const { splitPrefix } = require('./resolve.js')

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

/**
 * Derive the set of live spec slugs from the specs that still have a git
 * worktree. The **worktree is the liveness signal** (see module header): the
 * registry is not consulted here. Pure — the caller supplies the spec list and
 * the set of live worktree paths (both gathered via IO).
 *
 * @param {Array<{slug:string, worktreePath:string}>} specs
 * @param {Set<string>|Iterable<string>} liveWorktreePaths  absolute paths.
 * @returns {Set<string>} slugs whose worktree currently exists.
 */
function liveSlugsForSpecs(specs, liveWorktreePaths) {
  const live = liveWorktreePaths instanceof Set ? liveWorktreePaths : new Set(liveWorktreePaths || [])
  const slugs = new Set()
  for (const spec of specs || []) {
    if (spec && spec.worktreePath && live.has(spec.worktreePath)) slugs.add(spec.slug)
  }
  return slugs
}

/**
 * Reconcile the slot registry against the volumes we're about to reap. A stale
 * slot is one whose spec's DB volume is an orphan — freeing it converges the
 * registry back to what actually exists (the registry is keyed by spec *folder*,
 * so we split each folder's prefix to get its slug and match it to a reaped
 * volume by the same `{repoSlug}_{slug}_` prefix used for orphan detection).
 * Pure: returns a new registry object plus the folders freed; never mutates.
 *
 * @param {{slots: Object<string,number>}} registry
 * @param {Array<{name:string}>} orphans  the volumes planPrune decided to reap.
 * @param {string} repoSlug
 * @returns {{ registry: {slots: Object<string,number>}, freed: string[] }}
 */
function reconcileRegistry(registry, orphans, repoSlug) {
  const slots = { ...((registry && registry.slots) || {}) }
  const reaped = (orphans || []).map((o) => o.name)
  const freed = []
  for (const folder of Object.keys(slots)) {
    const { slug } = splitPrefix(folder)
    const prefix = `${repoSlug}_${slug}_`
    if (reaped.some((name) => name.startsWith(prefix))) {
      delete slots[folder]
      freed.push(folder)
    }
  }
  return { registry: { slots }, freed }
}

module.exports = { planPrune, liveSlugsForSpecs, reconcileRegistry }
