'use strict'

/**
 * Restricted glob matching for repo-relative paths, shared by the live-overlay
 * migration check and the conditional `afterLand` entries. Zero-dependency.
 */

// Translate a restricted glob into an anchored RegExp: `**` matches across path
// separators (with an optional trailing `/`), `*` matches within a segment, `?`
// a single non-separator char. Enough for repo-path globs, no dependency.
function globToRegExp(glob) {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++ // consume the `/` in `**/`
      } else {
        re += '[^/]*'
      }
    } else if (ch === '?') {
      re += '[^/]'
    } else if ('.+^${}()|[]\\/'.includes(ch)) {
      re += '\\' + ch
    } else {
      re += ch
    }
  }
  return new RegExp('^' + re + '$')
}

module.exports = { globToRegExp }
