'use strict'

/**
 * A minimal line diff — just enough for `update` to say what it skipped.
 *
 * `update` reports a file it kept as `customized (kept)` and nothing else, so
 * there is no way to learn WHICH upstream changes you declined without diffing
 * against `node_modules` by hand. That is how a real behavioural change (the
 * lifecycle skills learning to commit their own edits) went unnoticed through an
 * upgrade in the field.
 *
 * Zero dependencies on purpose: this package ships with none, and `diff(1)` is
 * not a portable guarantee. An LCS over lines is a few dozen lines of code and
 * the inputs are markdown files of a few hundred lines.
 */

// Longest-common-subsequence walk over two line arrays, as a flat op list.
// `t` is ' ' (context), '-' (only in `a`) or '+' (only in `b`).
function diffOps(a, b) {
  const n = a.length
  const m = b.length
  // dp[i][j] = LCS length of a[i..] and b[j..], flattened.
  const dp = new Int32Array((n + 1) * (m + 1))
  const at = (i, j) => i * (m + 1) + j
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] = a[i] === b[j] ? dp[at(i + 1, j + 1)] + 1 : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)])
    }
  }

  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: ' ', line: a[i], a: i, b: j })
      i++
      j++
    } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) {
      ops.push({ t: '-', line: a[i], a: i, b: j })
      i++
    } else {
      ops.push({ t: '+', line: b[j], a: i, b: j })
      j++
    }
  }
  while (i < n) {
    ops.push({ t: '-', line: a[i], a: i, b: j })
    i++
  }
  while (j < m) {
    ops.push({ t: '+', line: b[j], a: i, b: j })
    j++
  }
  return ops
}

// Group the ops into unified-diff hunks, each carrying `context` unchanged lines
// either side of a run of changes. Runs closer together than 2×context merge, as
// `diff -u` does, so a cluster of edits reads as one hunk.
function toHunks(ops, context) {
  const changed = ops.map((o) => o.t !== ' ')
  const hunks = []
  let k = 0
  while (k < ops.length) {
    if (!changed[k]) {
      k++
      continue
    }
    let start = Math.max(0, k - context)
    let end = k
    // Extend while the next change is near enough to keep in the same hunk.
    for (let p = k; p < ops.length; p++) {
      if (changed[p]) end = p
      else if (p - end > context * 2) break
    }
    end = Math.min(ops.length - 1, end + context)

    const body = ops.slice(start, end + 1)
    const aStart = body[0].a + 1
    const bStart = body[0].b + 1
    const aLen = body.filter((o) => o.t !== '+').length
    const bLen = body.filter((o) => o.t !== '-').length
    hunks.push(
      [`@@ -${aStart},${aLen} +${bStart},${bLen} @@`, ...body.map((o) => `${o.t}${o.line}`)].join('\n'),
    )
    k = end + 1
  }
  return hunks
}

/**
 * Diff `a` (what is on disk) against `b` (what the package ships).
 *
 * `added`/`removed` count the lines an update WOULD add and remove — the summary
 * printed beside a kept file. `hunks` are unified-diff blocks for `--diff`.
 *
 * @param {string|string[]} a
 * @param {string|string[]} b
 * @param {{context?:number}} [opts]
 * @returns {{added:number, removed:number, hunks:string[]}}
 */
function linesDiff(a, b, { context = 3 } = {}) {
  const A = Array.isArray(a) ? a : String(a).split('\n')
  const B = Array.isArray(b) ? b : String(b).split('\n')
  const ops = diffOps(A, B)
  return {
    added: ops.filter((o) => o.t === '+').length,
    removed: ops.filter((o) => o.t === '-').length,
    hunks: toHunks(ops, context),
  }
}

module.exports = { linesDiff }
