'use strict'

/**
 * The apply ORCHESTRATION — the ordering, stamping and accounting shared by
 * every provider's `spec-sync apply`, with the tracker calls themselves left
 * to provider `ops` (deferred to this shape until two providers existed to
 * validate it: one folds workflow state into its create/update payloads, the
 * other must move status by a separate transition call — so state application
 * lives inside the ops, and the skeleton owns only what is identical).
 *
 * What the skeleton owns, in order:
 *
 *   1. resolve every workflow state BEFORE the first write, so a bad
 *      `config.states` value cannot strand the spec mid-apply;
 *   2. the twin-mint guard: an EXACT-title issue held by no spec is a positive
 *      signal the issue already exists — refuse to mint a second (a fuzzy
 *      match must never count: being wrong here blocks a legitimate push);
 *   3. mint-or-update the spec issue, stamping the identifier the moment the
 *      create lands — an interrupt after that point must not mint a twin;
 *   4. sub-issue creates, each STAMPED AS IT LANDS, then updates (keyed by
 *      ref, never by id — the read-back matches by ref);
 *   5. read back what the tracker stored and run the same check `verify` runs;
 *   6. record the snapshot from the now-stamped files, so the next push is
 *      empty.
 *
 * Orphan accounting rides the whole way: `created` is what the tracker holds,
 * `stamped` what the repo recorded, and the one case a re-run makes WORSE is a
 * create whose stamp could not be written — the identifiers travel out on the
 * error so the caller can name them.
 *
 * @param {object} ops the provider's tracker calls:
 *   - `prevalidateStates(buckets)`          throw early on a bad state name
 *   - `mintIssue({ title, issue })`         → `{ id, identifier, url }`
 *   - `updateIssue(existing, issue)`        apply `plan.issue` to a live issue
 *   - `mintSubIssue(parentId, sub)`         → `{ id, identifier }`
 *   - `updateSubIssue(sub)`                 apply a sub-issue update
 *   - `remoteEditedLine(identifier)`        the someone-else-edited warning
 *   - `twinAdvice(twin, title, specName)`   the refusal message for a twin
 */

const path = require('node:path')

const {
  readSnapshot,
  readBase,
  projectionOf,
  recordPush,
  writeFrontmatter,
  stampSubIssueId,
  fieldsOf,
  remoteDescriptionEdited,
  remoteSubIssueEdited,
  listPhaseFiles,
} = require('@skitterbyte/skitterspec-sync-core')
const { makeSpecHelpers } = require('./specs.js')

/**
 * The outer accounting wrapper: run the inner apply, and on ANY throw attach
 * what had been stamped versus created by the time it happened.
 */
async function applySpecPlan(args) {
  const progress = {}
  try {
    return await applyInner({ ...args, progress })
  } catch (error) {
    const r = progress.result
    if (error && typeof error === 'object' && error.stamped === undefined) {
      error.stamped = r ? (r.issue ? 1 : 0) + Object.keys(r.subIssues || {}).length : 0
      error.created = progress.created || []
      error.orphans = error.created.slice(error.stamped)
    }
    throw error
  }
}

async function applyInner({ dir, config, snapshotDir, plan, adapter, ops, progress, forceNew = false, program = 'spec-sync' }) {
  const fields = fieldsOf(config)
  const helpers = makeSpecHelpers({ program })
  const overviewFile = (config.snapshot && config.snapshot.overviewFile) || '00-overview.md'
  const identifier = helpers.linkedIdentifier(path.join(snapshotDir, overviewFile), config)
  const lines = []
  const result = { issue: null, subIssues: {} }
  // Handed out immediately, so a throw from anywhere below still reports what
  // had been stamped by the time it happened.
  if (progress) progress.result = result

  // 1. Every state resolved BEFORE the first write.
  const wanted = new Set()
  if (plan.issue && plan.issue.state) wanted.add(plan.issue.state)
  for (const s of (plan.subIssues && plan.subIssues.create) || []) if (s.state) wanted.add(s.state)
  for (const s of (plan.subIssues && plan.subIssues.update) || []) if (s.state) wanted.add(s.state)
  ops.prevalidateStates([...wanted])

  let parentId = null
  if (!identifier) {
    // 2. REFUSE TO MINT A TWIN. An EXACT match held by no spec is a positive
    // signal that the issue already exists; a near-match must never count —
    // being wrong here blocks a legitimate push, and a renamed spec is
    // answered by adopting the issue, not by fuzz.
    if (!forceNew && adapter.searchIssues) {
      const title = String(plan.title || readSnapshot(snapshotDir, config).title || '').trim()
      if (title) {
        let found = []
        try {
          found = (await ops.searchTwin(title)) || []
        } catch {
          // A search we could not run is not evidence of an orphan. Carry on
          // and mint — the cannot-tell case goes to the harmless branch, which
          // here is the one that does the work the caller asked for.
          found = []
        }
        const claimed = new Set(helpers.listSpecs(dir, config).map((sp) => sp.identifier).filter(Boolean))
        const twin = found.find(
          (i) => i && i.identifier && !claimed.has(i.identifier) && String(i.title || '').trim() === title,
        )
        if (twin) throw new Error(ops.twinAdvice(twin, title, path.basename(snapshotDir)))
      }
    }
    // 3. Mint, then stamp IMMEDIATELY: noted before it is stamped, so a stamp
    // that cannot be written can still name the identifier it strands.
    const created = await ops.mintIssue({ title: readSnapshot(snapshotDir, config).title, issue: plan.issue })
    parentId = created.id
    if (progress) (progress.created = progress.created || []).push(created.identifier)
    writeFrontmatter(snapshotDir, config, {
      [fields.identifier]: created.identifier,
      [fields.url]: created.url,
    })
    result.issue = { id: created.id, identifier: created.identifier, url: created.url }
    lines.push(`  issue created: ${created.identifier}`)
  } else {
    const existing = await adapter.readIssue(identifier)
    if (!existing || !existing.id) throw new Error(ops.missingIssueMessage(identifier))
    parentId = existing.id
    result.issue = { id: existing.id, identifier: existing.identifier, url: existing.url }

    // SOMEONE ELSE EDITED THE DESCRIPTION SINCE THE LAST PUSH, and this write
    // replaces it. A WARNING AND NEVER A REFUSAL: one-way sync means the repo
    // wins; what was wrong was winning silently.
    if (remoteDescriptionEdited(readBase(dir, identifier, config), existing, config) === true) {
      lines.push(ops.remoteEditedLine(identifier))
    }
    if (plan.issue) {
      await ops.updateIssue(existing, plan.issue)
      lines.push(`  issue updated: ${identifier}`)
    }
  }

  // 4. Sub-issue creates — each stamped as it lands, for the same reason.
  for (const sub of (plan.subIssues && plan.subIssues.create) || []) {
    const created = await ops.mintSubIssue(parentId, sub)
    if (progress) (progress.created = progress.created || []).push(created.identifier)
    const file = resolvePhaseFileIn(snapshotDir, sub.ref)
    if (!file) throw new Error(`no phase file for ref ${sub.ref}`)
    stampSubIssueId(snapshotDir, file, created.identifier, config)
    result.subIssues[sub.ref] = created.identifier
    lines.push(`  sub-issue created: ${sub.ref} → ${created.identifier}`)
  }

  // 5. Sub-issue updates — keyed by REF, never by id: the read-back matches
  // sub-issues to phases by ref, and a plan written before updates carried a
  // ref still resolves — by id, off the projection.
  const refById = new Map()
  for (const s of projectionOf(snapshotDir, config).subIssues || []) {
    if (s.id != null) refById.set(String(s.id), s.ref)
  }
  // A phase body edited on the tracker gets the same warning as the spec
  // issue. The read is spent only where the snapshot recorded something to
  // compare against, so an old snapshot costs no extra calls.
  const base = readBase(dir, identifier, config)
  for (const sub of (plan.subIssues && plan.subIssues.update) || []) {
    const streams = base && base.subIssueStreams
    if (sub.goal != null && streams && streams[String(sub.id)]) {
      const before = await adapter.readIssue(sub.id)
      if (remoteSubIssueEdited(base, sub.id, before, config) === true) lines.push(ops.remoteEditedLine(sub.id))
    }
    await ops.updateSubIssue(sub)
    result.subIssues[sub.ref || refById.get(String(sub.id)) || sub.id] = sub.id
    lines.push(`  sub-issue updated: ${sub.id}`)
  }

  // 6. Read back what the tracker stored and run the SAME check verify runs.
  const stored = { issue: undefined, subIssues: {} }
  if (result.issue) {
    const back = await adapter.readIssue(result.issue.id)
    if (back && typeof back.description === 'string') stored.issue = back.description
  }
  for (const [ref, id] of Object.entries(result.subIssues)) {
    const back = await adapter.readIssue(id)
    if (back && typeof back.description === 'string') stored.subIssues[ref] = back.description
  }
  const verify = helpers.verifyLines(snapshotDir, config, stored, result.issue ? result.issue.identifier : identifier)
  lines.push(...verify.map((l) => `  ${l}`))
  const lost = verify.some((l) => l.includes('!!') || l.includes('??'))

  // 7. Record the snapshot from the now-stamped files, so the next push is empty.
  const file = recordPush({ dir, snapshotDir, identifier: helpers.specIdentifier(snapshotDir, config), config })
  lines.push(`  snapshot: ${path.relative(dir, file)}`)
  return { result, lines, lost }
}

// The phase file a sub-issue ref names — the ref is the phase-file basename.
function resolvePhaseFileIn(snapshotDir, ref) {
  const want = String(ref).replace(/\.md$/, '')
  return listPhaseFiles(snapshotDir).find((f) => f.replace(/\.md$/, '') === want) || null
}

module.exports = { applySpecPlan }
