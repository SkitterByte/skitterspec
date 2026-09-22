'use strict'

/**
 * The frontmatter FIELD VOCABULARY — which keys a provider stamps into spec
 * files. The engine reads and writes stamps by these names and hardcodes none
 * of them: each provider's config loader supplies its own set (the Linear
 * provider defaults to `linear_identifier` / `linear_issue_id` / …), so a
 * second provider stamps its own keys without touching the engine.
 *
 * Required keys: `identifier`, `url`, `issueId`, `assigneeId`.
 * Optional: `assigneeName`, and `legacyIdentifier` / `legacyIssueId` — the keys
 * a pre-9.0 mirror stamped. A provider with no legacy era simply omits them,
 * and legacy detection then reports nothing (`legacy.js`).
 *
 * A missing `config.fields` THROWS rather than defaulting: a silent default
 * would let the engine read stamps under names the provider never wrote, and
 * the failure that produces is an all-creates plan that duplicates a live
 * mirror — far worse than a loud error at the first call.
 */

function fieldsOf(config) {
  const f = config && config.fields
  if (!f || typeof f !== 'object' || Array.isArray(f)) {
    throw new Error(
      'config.fields missing — the provider config must name its frontmatter fields (identifier, url, issueId, assigneeId)',
    )
  }
  for (const key of ['identifier', 'url', 'issueId', 'assigneeId']) {
    if (typeof f[key] !== 'string' || !f[key]) {
      throw new Error(`config.fields.${key} missing — the provider config must name this frontmatter field`)
    }
  }
  return f
}

module.exports = { fieldsOf }
