'use strict'

/**
 * The CodeRabbit adapter — `{ "use": "coderabbit" }` is the whole config.
 *
 * A bundled adapter owns two things the generic path cannot: the command line
 * (this tool's flags are its own, and leaking them into skitterspec's config
 * schema was rejected in the spec's Decision 2), and the parser (`cr --agent`
 * emits a JSONL EVENT STREAM, not diagnostics).
 *
 * It also owns the one thing that makes Decision 6 honest. The generic runner
 * sees an exit code and some bytes; it cannot tell a review that found nothing
 * from a CLI that declined because nobody is logged in. This adapter can, and
 * the difference decides whether the page reads `clean` or `did not run — not
 * authenticated` to someone about to commit.
 *
 * SHAPE OF A BUNDLED ADAPTER, so a second one is a file rather than a refactor:
 *
 *   command(vars) -> string          the shell line, given ${scope}/${base}/…
 *   parse(stdout, ctx) -> { findings, malformed, said }
 *
 * `said` is an outcome this adapter is sure of, or null to let the generic
 * rules decide. It can never make a run read as clean that the generic path
 * called failed — it only ever sharpens or downgrades.
 */

// Severities `cr` emits, worst first. `error` is not among them, so the generic
// `levelFor` would call every finding `confirm` — hence the explicit map.
const FLAG_SEVERITIES = ['critical', 'major']

/**
 * Patterns that mean THE REVIEW DID NOT HAPPEN, as opposed to happening and
 * finding nothing.
 *
 * WHAT WOULD FOOL THIS: the CLI's own wording, which is not a documented
 * surface and will change. A pattern that stops matching costs the sharper
 * sentence and nothing else — the run still reports `did not run` with whatever
 * text it did have, because this list only ever runs on output the generic
 * rules ALREADY decided was a failure or an `error` event. It cannot turn a
 * clean review into an accusation, which is the direction that would matter.
 */
const NOT_RUN = [
  [/not (?:authenticated|logged in)|unauthori[sz]ed|auth(?:entication)? (?:failed|required)|cr auth login|invalid api key/i, 'not authenticated'],
  [/rate limit|too many requests|quota (?:exceeded|exhausted)|429/i, 'rate limited'],
  [/network|enotfound|econnrefused|etimedout|dns|offline|could not reach/i, 'no network'],
  [/not supported on|unsupported platform/i, 'unsupported platform'],
]

function classify(text) {
  const s = typeof text === 'string' ? text : ''
  for (const [re, label] of NOT_RUN) {
    if (re.test(s)) return label
  }
  return null
}

/**
 * The command line, per scope. The two scopes are the render's own two modes,
 * so what the page shows is what was reviewed.
 *
 * `working` — uncommitted and untracked, which is what a phase-end render
 *   collects: the page is written BEFORE the commit.
 * `branch` — the whole spec against its base, which is what `--branch` shows.
 */
function command(vars) {
  if (vars.scope === 'branch' && vars.base) {
    return `cr review --agent --base ${shellQuote(vars.base)}`
  }
  return 'cr review --agent --uncommitted --include-untracked'
}

// The base comes from a project's own config, not from a page — but it reaches
// a shell either way, and a branch name is allowed to contain almost anything.
function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`
}

/**
 * Read the `--agent` stream: one JSON object per line, dispatched on `type`.
 *
 * UNKNOWN EVENT TYPES AND UNKNOWN FIELDS ARE BOTH IGNORED, never fatal. The
 * stream is additive by design, so both mean "a newer CLI than this adapter" —
 * and refusing a whole review because one line carried a field we had not seen
 * would turn every CodeRabbit release into a broken adapter.
 */
function parse(stdout, ctx = {}) {
  const findings = []
  let malformed = 0
  let events = 0
  let errorText = null
  let skipped = false

  for (const raw of String(stdout == null ? '' : stdout).split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      malformed++
      continue
    }
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) {
      malformed++
      continue
    }
    events++
    switch (ev.type) {
      case 'finding': {
        const f = readFinding(ev)
        if (f) findings.push(f)
        else malformed++
        break
      }
      case 'error':
        // First one wins: what went wrong first is what explains the rest.
        if (!errorText) errorText = textOf(ev.message) || textOf(ev.error) || 'the reviewer reported an error'
        break
      case 'status':
        // Exit 0 with nothing to look at. A real outcome, and a clean one.
        if (ev.status === 'review_skipped') skipped = true
        break
      // `review_context`, `heartbeat`, `complete` and anything added later
      // carry nothing this needs. A heartbeat is a keep-alive; the runner's
      // timeout is generous enough not to need it, and reaching for it would
      // couple the runner to one adapter's stream.
      default:
        break
    }
  }

  return { findings, malformed, said: said({ ctx, findings, events, errorText, skipped }) }
}

/**
 * What this adapter is sure of, or null to let the generic rules decide.
 *
 * IT NEVER UPGRADES A FAILURE TO CLEAN. Every branch below either sharpens a
 * failure's wording or reports one the generic path would have missed; the
 * clean readings are handed back as `null` for `outcomeFor` to reach on its own
 * terms. That asymmetry is the whole safety property — this file is where a
 * vendor-specific guess could quietly turn "nobody is logged in" into a page
 * that reads as approved.
 */
function said({ ctx, findings, events, errorText, skipped }) {
  const exitCode = ctx.exitCode
  const stderr = ctx.stderr

  // An `error` event is the tool telling us directly.
  if (errorText) {
    const why = classify(errorText) || classify(stderr)
    return { state: 'failed', detail: why || firstLine(errorText) }
  }

  // A non-zero exit with a recognisable reason: say which, rather than echoing
  // whatever sentence happened to be first on stderr.
  if (exitCode !== 0) {
    const why = classify(stderr)
    if (why) return { state: 'failed', detail: why }
    return null
  }

  // Exit 0 and the tool said it had nothing to review. Clean, and count it as
  // such rather than letting an empty stream look like a truncated one.
  if (skipped && !findings.length) return { state: 'clean', detail: 'nothing to review' }

  // Exit 0, no findings, and NOT ONE well-formed event: the stream was not the
  // stream we expect. `outcomeFor` would read this as clean when stdout was
  // empty, and that is the false clean this whole feature exists against —
  // cannot-tell routed to the branch that does not claim the code was read.
  if (!events && !findings.length) {
    const why = classify(stderr)
    return { state: 'failed', detail: why || 'no review events — is `cr` authenticated?' }
  }

  return null
}

/**
 * One finding → one rdjsonl-shaped diagnostic.
 *
 * THE LINE NUMBER IS THE SOFT PART, and worth naming. The documented finding
 * shape is `{severity, fileName, codegenInstructions, suggestions, comment}` —
 * there is NO documented line field. So every plausible spelling is read and a
 * finding with none still renders; it simply loses its jump button rather than
 * being dropped. A finding nobody can place is worth far more than no finding.
 */
function readFinding(ev) {
  const file = textOf(ev.fileName) || textOf(ev.file) || textOf(ev.path)
  // `codegenInstructions` first, per the CLI's own guidance, falling back to
  // the human-readable comment when it is absent.
  const message = textOf(ev.codegenInstructions) || textOf(ev.comment) || textOf(ev.message)
  if (!file || !message) return null
  return { file, line: lineOf(ev), severity: severityOf(ev.severity), message }
}

function lineOf(ev) {
  const nested = ev.range && ev.range.start ? ev.range.start.line : undefined
  for (const v of [nested, ev.line, ev.startLine, ev.lineNumber, ev.start_line]) {
    if (Number.isInteger(v) && v > 0) return v
  }
  return null
}

/**
 * Map `cr`'s severity onto the one word the generic `levelFor` turns into a
 * level. `critical` and `major` become `error` → `flag`; everything else,
 * including a severity this build has never seen, becomes `confirm`.
 *
 * An unknown severity landing on `confirm` rather than `flag` is deliberate: a
 * page where everything shouts is a page nobody reads, and the finding is still
 * there either way.
 */
function severityOf(severity) {
  const s = typeof severity === 'string' ? severity.trim().toLowerCase() : ''
  return FLAG_SEVERITIES.includes(s) ? 'error' : 'warning'
}

function textOf(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : ''
}

function firstLine(s) {
  const line = String(s || '').split('\n').map((l) => l.trim()).find(Boolean)
  return line ? (line.length > 200 ? line.slice(0, 197) + '…' : line) : null
}

module.exports = { command, parse, classify, readFinding, severityOf, FLAG_SEVERITIES }
