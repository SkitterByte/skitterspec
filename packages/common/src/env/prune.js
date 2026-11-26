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
 * **A candidate needs a positive signal that a spec stack owned it.** A name
 * prefix is not one: the primary checkout's own compose file can name its
 * volumes `{repoSlug}_db_data` (external, unlabelled), and the base stack's
 * non-external volumes are `{repoSlug}_<vol>` too — both read as orphans to a
 * prefix match (bug-prune-reaps-base-volumes, which offered to delete a live dev
 * database). So a volume is a candidate only when ALL of these hold:
 *
 *   1. its `com.docker.compose.project` label matches `docker.projectNamePattern`
 *      with `{slug}` as the wildcard — the label compose stamps on every volume
 *      it creates for that project, and never on an external one;
 *   2. the slug that label names has no live worktree;
 *   3. docker reports it referenced by no container, running or stopped
 *      (`inUse === false` — unknown is kept);
 *   4. the base compose file does not mention its name (`protectNames`).
 *
 * WHAT WOULD FOOL THIS: a volume someone created by hand with a spec project's
 * label on it. It would be reaped like a spec's — which is what the label says
 * it is. Everything that cannot be told routes to keeping the volume.
 *
 * The slug match is exact: slugs are kebab-case (`[a-z0-9-]`) and the label is
 * matched whole, so `add` never protects `add-widget`.
 *
 * Side-effect free and deterministic: no `Date.now()` — the caller supplies
 * `now` (and per-volume `createdAt`) when age-gating.
 */

const { splitPrefix, expandTokens } = require('./resolve.js')

const DEFAULT_PATTERN = '{repoSlug}_{slug}'

// `docker.projectNamePattern` as a whole-label matcher, `{slug}` captured.
// Compose lowercases project names, so the match is on lowercase. Null when the
// pattern has no `{slug}` — then no label can name a spec, and that is
// cannot-tell, not "nothing is a spec's".
function projectMatcher(pattern, repoSlug, repo) {
  const SLUG = '\u0000slug\u0000'
  const expanded = expandTokens(pattern, { repoSlug, repo: repo || repoSlug, slug: SLUG })
  if (!expanded.includes(SLUG)) return null
  const escape = (t) => t.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const [before, ...rest] = expanded.split(SLUG)
  if (rest.length !== 1) return null
  return new RegExp(`^${escape(before)}([a-z0-9][a-z0-9-]*)${escape(rest[0])}$`)
}

/**
 * @param {Array<string|{name:string,project?:string|null,inUse?:boolean|null,createdAt?:number|null}>} volumes
 *   Docker volumes: `project` is the compose project label (null when
 *   unlabelled), `inUse` whether any container references it (null when
 *   unknown). A plain string is a name with nothing known — never a candidate.
 * @param {Iterable<string>} liveSlugs  slugs of specs that still have a worktree.
 * @param {object} opts { repoSlug, repo?, projectPattern?, protectNames?, olderThanDays?, now? }
 *   `repoSlug` (required) and `repo` expand the pattern's tokens.
 *   `projectPattern` is `docker.projectNamePattern` (default `{repoSlug}_{slug}`).
 *   `protectNames` are volume names the base compose file mentions.
 *   `olderThanDays` (optional) keeps only orphans strictly older than the
 *   cutoff; when set, `now` (epoch-ms) is required and volumes of unknown age
 *   are conservatively kept.
 * @returns {{ orphans: Array<{name:string,slug:string,createdAt:number|null}>, commands: string[], cannotTell?: string }}
 */
function planPrune(volumes, liveSlugs, opts = {}) {
  const { repoSlug, repo, projectPattern = DEFAULT_PATTERN, protectNames = [], olderThanDays = null, now = null } = opts
  if (!repoSlug) throw new Error('planPrune: opts.repoSlug is required')
  if (olderThanDays != null && now == null) throw new Error('planPrune: olderThanDays requires opts.now')

  const matcher = projectMatcher(projectPattern, repoSlug, repo)
  if (!matcher) {
    return {
      orphans: [],
      commands: [],
      cannotTell: `docker.projectNamePattern "${projectPattern}" has no {slug}, so no volume can be told to be a spec's`,
    }
  }
  const live = liveSlugs instanceof Set ? liveSlugs : new Set(liveSlugs || [])
  const kept = new Set(protectNames)

  let orphans = []
  for (const v of volumes || []) {
    if (!v || typeof v !== 'object' || !v.name) continue
    if (v.inUse !== false || kept.has(v.name)) continue
    const m = typeof v.project === 'string' && matcher.exec(v.project.toLowerCase())
    if (!m || live.has(m[1])) continue
    orphans.push({ name: v.name, slug: m[1], createdAt: v.createdAt == null ? null : v.createdAt })
  }

  if (olderThanDays != null) {
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
  const reapedSlugs = new Set((orphans || []).map((o) => o.slug).filter(Boolean))
  const freed = []
  for (const folder of Object.keys(slots)) {
    const { slug } = splitPrefix(folder)
    const prefix = `${repoSlug}_${slug}_`
    if (reapedSlugs.has(slug) || reaped.some((name) => name.startsWith(prefix))) {
      delete slots[folder]
      freed.push(folder)
    }
  }
  return { registry: { slots }, freed }
}

module.exports = { planPrune, liveSlugsForSpecs, reconcileRegistry }
