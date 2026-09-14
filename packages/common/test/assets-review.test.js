'use strict'

/**
 * Guards for the shipped review page template.
 *
 * Two halves. The first reads the template as TEXT and asserts the properties
 * that make it a viewer rather than a coloured dump: both splice points present,
 * nothing loaded from the network, and every colour token defined in the bare
 * `:root` block. The second RUNS the page's own script against a hand-rolled DOM
 * shim, because the band/tree/filter logic is the substance of the phase and
 * asserting on markup strings would not touch it.
 *
 * The shim is deliberately ~80 lines of this file rather than a dependency: the
 * repo ships with two devDependencies and adding a DOM library to test one page
 * is a bigger change to the project than the page is.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const {
  renderReviewPage,
  loadTemplate,
  TEMPLATE_PATH,
  DATA_PLACEHOLDER,
  REVIEW_PLACEHOLDER,
} = require('../src/env/review.js')

const ROOT = path.join(__dirname, '..', '..', '..')
const TEMPLATE = loadTemplate()

// --- the template as text ---------------------------------------------------

test('the template ships with both splice points', () => {
  assert.ok(TEMPLATE.includes(DATA_PLACEHOLDER), 'data island placeholder')
  assert.ok(TEMPLATE.includes(REVIEW_PLACEHOLDER), 'review block placeholder')
  // The island must be a JSON script tag, not an inline JS literal: the engine
  // splices raw patch text in, and only `application/json` is inert.
  assert.match(TEMPLATE, /<script type="application\/json" id="review-data">__REVIEW_DATA__<\/script>/)
})

test('every distribution ships the template, not just the source package', () => {
  for (const pkg of ['skitterspec', 'skitterspec-linear']) {
    const p = path.join(ROOT, 'packages', pkg, 'assets', 'review', 'page.html')
    // A POSITIVE signal: the built distribution's own copy must exist and carry
    // the splice points. (Built output is gitignored, so a clean checkout that
    // has not run the build legitimately has neither — skip rather than accuse.)
    if (!fs.existsSync(path.join(ROOT, 'packages', pkg, 'assets'))) continue
    assert.ok(fs.existsSync(p), `${pkg} ships assets/review/page.html`)
    const t = fs.readFileSync(p, 'utf8')
    assert.ok(t.includes(DATA_PLACEHOLDER) && t.includes(REVIEW_PLACEHOLDER), `${pkg} template is intact`)
  }
})

test('the page loads nothing from the network', () => {
  const external = TEMPLATE.match(/(?:src|href)\s*=\s*"(?!#)[^"]*"/g) || []
  // A Google Fonts link would be the one permitted exception; this page takes
  // even that off the table so a review opens with no connection at all.
  assert.deepStrictEqual(external, [], 'no external stylesheet, script, font or image')
  assert.ok(!/url\(\s*['"]?https?:/.test(TEMPLATE), 'no remote url() in CSS')
})

test('every colour token the page uses is defined on bare :root', () => {
  // The bare block only — NOT the media query or the [data-theme] block. A token
  // whose sole definition lives in one of those is invisible in the other theme,
  // which is the classic way a page reads fine for its author and is unreadable
  // for everyone else.
  const bare = /:root\s*\{([^}]*)\}/.exec(TEMPLATE)
  assert.ok(bare, 'the bare :root block is present')
  const defined = new Set([...bare[1].matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  const used = new Set([...TEMPLATE.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]))
  const missing = [...used].filter((t) => !defined.has(t))
  assert.deepStrictEqual(missing, [], `tokens used but never defined on bare :root: ${missing.join(', ')}`)
})

test('both theme overrides exist, and only redefine', () => {
  assert.match(TEMPLATE, /:root:not\(\[data-theme="light"\]\)/, 'dark-by-preference is guarded')
  assert.match(TEMPLATE, /@media \(prefers-color-scheme: dark\)/, 'the preference query is present')
  assert.match(TEMPLATE, /:root\[data-theme="dark"\]/, 'an explicit toggle wins')
  assert.match(TEMPLATE, /body\s*\{[^}]*background:\s*var\(--bg\)/, 'body paints an explicit background')
})

test('add and remove are legible without colour, and controls show focus', () => {
  // A +/- gutter, not colour alone.
  assert.match(TEMPLATE, /row\.t === 'add' \? '\+' : row\.t === 'del' \? '-' : ' '/)
  assert.match(TEMPLATE, /:focus-visible[\s\S]{0,200}outline:/, 'a visible focus ring is defined')
})

test('the code box scrolls, not the page, and line numbers stay put', () => {
  assert.match(TEMPLATE, /\.code\s*\{[^}]*overflow-x:\s*auto/, 'the code box owns the horizontal scroll')
  assert.match(TEMPLATE, /td\.gutter\s*\{[^}]*position:\s*sticky/, 'line numbers are sticky')
  assert.match(TEMPLATE, /\.main\s*\{[^}]*min-width:\s*0/, 'the grid column may shrink below its content')
})

test('the page script parses', () => {
  const src = pageScript()
  new vm.Script(src, { filename: 'page.html:script' })
})

// --- the page script, run for real ------------------------------------------

function pageScript() {
  const m = /<script>\n([\s\S]*?)<\/script>/.exec(TEMPLATE)
  assert.ok(m, 'found the page script')
  return m[1]
}

// Enough CSS selector to serve the page: `.cls`, `[attr]`, `.cls[attr="v"]`.
// Anything richer would be a library, and the page does not ask for one.
function selectorMatches(node, sel) {
  const m = /^(?:\.([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/.exec(sel.trim())
  if (!m) throw new Error(`shim: unsupported selector ${sel}`)
  const [, cls, attr, value] = m
  if (cls && !String(node.className || '').split(/\s+/).includes(cls)) return false
  if (attr) {
    const got = node.getAttribute ? node.getAttribute(attr) : null
    if (got === null) return false
    if (value !== undefined && got !== value) return false
  }
  return true
}

function queryAll(root, sel, out = []) {
  for (const child of root.childNodes || []) {
    if (child.getAttribute && selectorMatches(child, sel)) out.push(child)
    queryAll(child, sel, out)
  }
  return out
}

// A DOM shim: only what the page actually touches. Anything the page starts
// using that is not here fails loudly as a TypeError, which is the behaviour we
// want — a silent stub would let a broken page pass.
function fakeDom(islandText) {
  const make = (tag) => {
    const node = {
      tagName: tag,
      className: '',
      childNodes: [],
      parent: null,
      listeners: {},
      attrs: {},
      _open: false,
      hidden: false,
      checked: false,
      appendChild(c) {
        c.parent = node
        node.childNodes.push(c)
        return c
      },
      addEventListener(ev, fn) {
        ;(node.listeners[ev] = node.listeners[ev] || []).push(fn)
      },
      dispatch(ev) {
        const event = { target: node, preventDefault() {}, stopPropagation() {} }
        for (const fn of node.listeners[ev] || []) fn(event)
      },
      replaceChild(next, old) {
        const at = node.childNodes.indexOf(old)
        if (at === -1) return old
        next.parent = node
        node.childNodes[at] = next
        return old
      },
      querySelector(sel) {
        return queryAll(node, sel)[0] || null
      },
      querySelectorAll(sel) {
        return queryAll(node, sel)
      },
      focus() {},
      select() {},
      setAttribute(k, v) {
        node.attrs[k] = v
      },
      getAttribute(k) {
        return Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null
      },
      scrollIntoView() {},
      value: '',
      closest(sel) {
        const cls = sel.replace(/^\./, '')
        let n = node
        while (n) {
          if (String(n.className).split(/\s+/).includes(cls)) return n
          n = n.parent
        }
        return null
      },
    }
    Object.defineProperty(node, 'parentNode', { get: () => node.parent })
    Object.defineProperty(node, 'textContent', {
      get() {
        return node.childNodes.map((c) => (c.nodeValue != null ? c.nodeValue : c.textContent)).join('')
      },
      set(v) {
        node.childNodes = []
        if (v !== '') node.appendChild({ nodeValue: String(v), childNodes: [], parent: node })
      },
    })
    // `open` fires `toggle`, which is how the page renders a file lazily.
    Object.defineProperty(node, 'open', {
      get: () => node._open,
      set(v) {
        const changed = node._open !== v
        node._open = v
        if (changed) node.dispatch('toggle')
      },
    })
    return node
  }

  const byId = {}
  for (const id of [
    'title', 'sub', 'files', 'tree', 'tree-wrap', 'tree-summary',
    'expand-all', 'collapse-all', 'show-noise', 'noise-label', 'theme', 'review-block',
    'verdict', 'verdict-commit', 'verdict-commit-continue', 'verdict-changes', 'verdict-discuss',
    'verdict-count', 'verdict-log', 'copy-out', 'copy-hint',
    'sent-cmd', 'sent-cmd-text', 'sent-cmd-copy',
  ]) {
    byId[id] = make('div')
    byId[id].id = id
  }
  // The shim cannot parse markup, so an element that SHIPS hidden would start
  // out visible here and a test could not tell "the page revealed it" from
  // "the shim never hid it". Read the initial state off the template itself
  // rather than listing ids by hand, so it cannot drift from what ships.
  for (const tag of TEMPLATE.match(/<[^>]*\bid="[^"]+"[^>]*>/g) || []) {
    const id = /\bid="([^"]+)"/.exec(tag)[1]
    if (byId[id] && /\shidden(\s|>|=)/.test(tag)) byId[id].hidden = true
  }

  // The noise checkbox must sit inside a `.toggle` for closest() to find it.
  const toggleLabel = make('label')
  toggleLabel.className = 'toggle'
  toggleLabel.appendChild(byId['show-noise'])

  const island = make('script')
  island.textContent = islandText
  byId['review-data'] = island

  // One root so document-level queries can reach everything the page builds.
  const root = make('div')
  root.appendChild(byId['review-block'])
  root.appendChild(byId.files)

  const document = {
    documentElement: make('html'),
    createElement: make,
    createTextNode: (t) => ({ nodeValue: String(t), childNodes: [] }),
    getElementById: (id) => byId[id] || null,
    querySelector: (sel) => queryAll(root, sel)[0] || null,
    querySelectorAll: (sel) => queryAll(root, sel),
    _root: root,
    _register: (id, node) => { byId[id] = node },
  }
  // Elements the page mints and then looks up by id (the per-file <details>).
  const origCreate = document.createElement
  document.createElement = (tag) => {
    const n = origCreate(tag)
    Object.defineProperty(n, 'id', {
      get: () => n._id,
      set(v) { n._id = v; byId[v] = n },
    })
    return n
  }

  const store = new Map()
  const window = {
    matchMedia: (q) => ({ matches: /min-width/.test(q) }),
    // Real enough to prove the autosave round-trips; `_fail` makes it throw the
    // way Safari does on file://, which is the case the page must survive.
    localStorage: {
      _fail: false,
      getItem(k) {
        if (this._fail) throw new Error('storage disabled')
        return store.has(k) ? store.get(k) : null
      },
      setItem(k, v) {
        if (this._fail) throw new Error('storage disabled')
        store.set(k, v)
      },
    },
    setTimeout: (fn) => fn(),
  }
  return { document, window, byId, store }
}

function runPage(data, { checks = [], failStorage = false, clipboard = true, protocol = 'file:', fetchWith = null } = {}) {
  const html = renderReviewPage(data)
  const island = /<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/.exec(html)
  assert.ok(island, 'the island was not closed early')
  const dom = fakeDom(island[1])
  if (failStorage) dom.window.localStorage._fail = true
  // The review block is spliced in as MARKUP, which the shim cannot parse — so
  // a test that wants checks hands them over already built.
  for (const c of checks) {
    const li = dom.document.createElement('li')
    li.className = `check ${c.level || 'confirm'}`
    li.setAttribute('data-check', c.id)
    if (c.file) li.setAttribute('data-file', c.file)
    dom.byId['review-block'].appendChild(li)
  }
  const copied = []
  // No clipboard at all is the `file://` case on a browser that withholds it.
  const navigator = clipboard
    ? { clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve() } } }
    : {}
  // The page decides how to send from what it IS — `file:` copies, anything
  // else posts — so the shim has to carry a protocol and a path.
  const location = { protocol, pathname: '/tok/feat-x' }
  const posted = []
  const fetch = (url, opts) => {
    posted.push({ url, ...opts })
    return fetchWith
      ? fetchWith(url, opts)
      : Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"code":"418207"}') })
  }
  vm.runInNewContext(
    `(function (document, window, navigator, location, fetch) { ${pageScript()} })(document, window, navigator, location, fetch)`,
    {
      document: dom.document,
      window: dom.window,
      navigator,
      location,
      fetch,
      JSON,
      encodeURIComponent,
      Promise,
    },
  )
  dom.copied = copied
  dom.posted = posted
  return dom
}

// Walk a shim tree collecting nodes whose className contains `cls`.
function findAll(node, cls, out = []) {
  if (node.className && String(node.className).split(/\s+/).includes(cls)) out.push(node)
  for (const c of node.childNodes || []) findAll(c, cls, out)
  return out
}

function fixture(overrides = {}) {
  // 60 unchanged lines, one changed, then 39 more. Big enough that a single
  // ±20 leaves the band standing — a fixture that vanishes on one click cannot
  // tell "expanded correctly" from "removed the band by mistake".
  const body = []
  for (let i = 1; i <= 60; i++) body.push(` line ${i}`)
  body.push('-line 61 old', '+line 61 new')
  for (let i = 62; i <= 100; i++) body.push(` line ${i}`)
  const patch = ['--- a/src/app.js', '+++ b/src/app.js', '@@ -1,100 +1,100 @@', ...body].join('\n')
  return {
    spec: 'feat-x',
    title: 'feat-x',
    branch: 'feat/x',
    mode: 'working',
    base: null,
    generatedAt: '2020-01-01T00:00:00.000Z',
    totals: { files: 2, additions: 1, deletions: 1 },
    review: null,
    files: [
      { path: 'src/app.js', status: 'modified', additions: 1, deletions: 1, whole: true, noise: false, binary: false, patch },
      {
        path: 'specs/in-progress/feat-x/00-overview.md',
        status: 'modified', additions: 1, deletions: 0, whole: true, noise: true, binary: false,
        patch: ['--- a/x', '+++ b/x', '@@ -1,1 +1,2 @@', ' # x', '+more'].join('\n'),
      },
    ],
    ...overrides,
  }
}

test('unchanged runs collapse into bands that report what they hide', () => {
  const dom = runPage(fixture())
  const bands = findAll(dom.byId.files, 'band')
  assert.strictEqual(bands.length, 2, 'one band above the change, one below')
  assert.match(bands[0].textContent, /unchanged lines/)
  // 60 leading context lines, 4 kept next to the change → 56 hidden.
  assert.match(bands[0].textContent, /^⋯56 unchanged lines/)
})

test('expanding a band re-renders the file with more context, not fewer bands', () => {
  const dom = runPage(fixture())
  const before = findAll(dom.byId.files, 'band')
  const stepBtn = before[0].childNodes[1].childNodes[1]
  stepBtn.dispatch('click')
  const after = findAll(dom.byId.files, 'band')
  assert.strictEqual(after.length, 2, 'the band is still there, just smaller')
  // 56 hidden, 20 revealed at each end → 16.
  assert.match(after[0].textContent, /^⋯16 unchanged lines/)
})

test('"show all" removes a band entirely', () => {
  const dom = runPage(fixture())
  const band = findAll(dom.byId.files, 'band')[0]
  band.childNodes[1].childNodes[2].dispatch('click')
  const after = findAll(dom.byId.files, 'band')
  assert.strictEqual(after.length, 1, 'only the band below the change remains')
})

test('the page-level control expands every file at once', () => {
  const dom = runPage(fixture())
  assert.ok(findAll(dom.byId.files, 'band').length > 0)
  dom.byId['expand-all'].dispatch('click')
  assert.deepStrictEqual(findAll(dom.byId.files, 'band'), [])
  dom.byId['collapse-all'].dispatch('click')
  assert.ok(findAll(dom.byId.files, 'band').length > 0, 'and puts them back')
})

test('the tree lists every file, including the ones the noise filter hides', () => {
  const dom = runPage(fixture())
  const entries = findAll(dom.byId.tree, 'tree-file')
  assert.strictEqual(entries.length, 2, 'both files are reachable from the tree')
  assert.ok(entries.some((e) => e.textContent.includes('00-overview.md')), 'the bookkeeping file too')
  assert.match(dom.byId['tree-summary'].textContent, /Files \(2\)/)
})

test('clicking a hidden file in the tree turns the filter on and opens it', () => {
  const dom = runPage(fixture())
  const noiseDetails = dom.byId['f-' + encodeURIComponent('specs/in-progress/feat-x/00-overview.md')]
  assert.strictEqual(noiseDetails.hidden, true, 'bookkeeping starts filtered out')
  assert.strictEqual(noiseDetails.open, false, 'and unrendered')

  const entry = findAll(dom.byId.tree, 'tree-file').find((e) => e.textContent.includes('00-overview.md'))
  entry.dispatch('click')

  assert.strictEqual(dom.byId['show-noise'].checked, true, 'the filter was turned on for you')
  assert.strictEqual(noiseDetails.hidden, false)
  assert.strictEqual(noiseDetails.open, true)
})

test('the noise filter hides bookkeeping and leaves real code alone', () => {
  const dom = runPage(fixture())
  const code = dom.byId['f-' + encodeURIComponent('src/app.js')]
  const noise = dom.byId['f-' + encodeURIComponent('specs/in-progress/feat-x/00-overview.md')]
  assert.strictEqual(code.hidden, false)
  assert.strictEqual(noise.hidden, true)
  dom.byId['show-noise'].checked = true
  dom.byId['show-noise'].dispatch('change')
  assert.strictEqual(noise.hidden, false)
})

test('line numbers come from the hunk header, on both sides', () => {
  const dom = runPage(fixture())
  const gutters = findAll(dom.byId.files, 'gutter').map((g) => g.textContent)
  // The first rendered row is context line 57 (4 kept before the change at 61).
  assert.ok(gutters.some((g) => g.includes('57')), 'context carries its line number')
  const add = findAll(dom.byId.files, 'add')[0]
  assert.match(add.childNodes[0].textContent, /\+$/, 'an addition is marked in the gutter')
})

test('the theme button drives the [data-theme] attribute in both directions', () => {
  const dom = runPage(fixture())
  const root = dom.document.documentElement
  assert.strictEqual(root.getAttribute('data-theme'), null, 'untouched until asked')
  dom.byId.theme.dispatch('click')
  const first = root.getAttribute('data-theme')
  assert.ok(first === 'dark' || first === 'light')
  dom.byId.theme.dispatch('click')
  assert.notStrictEqual(root.getAttribute('data-theme'), first, 'and back again')
})

test('a patch containing </script> survives into the rendered rows', () => {
  const data = fixture()
  data.files = [
    {
      path: 'page.html', status: 'new', additions: 1, deletions: 0, whole: true, noise: false, binary: false,
      patch: ['--- /dev/null', '+++ b/page.html', '@@ -0,0 +1 @@', '+<script>var a = 1</script>'].join('\n'),
    },
  ]
  const dom = runPage(data)
  const adds = findAll(dom.byId.files, 'add')
  assert.strictEqual(adds.length, 1)
  assert.strictEqual(adds[0].childNodes[1].textContent, '<script>var a = 1</script>')
})

test('stays silent: a spec with no files renders a page rather than throwing', () => {
  const data = fixture({ files: [], totals: { files: 0, additions: 0, deletions: 0 } })
  const dom = runPage(data)
  assert.match(dom.byId.files.textContent, /Nothing to review/)
  assert.match(dom.byId['tree-summary'].textContent, /Files \(0\)/)
})

test('stays silent: a binary file says so instead of rendering an empty table', () => {
  const data = fixture({
    files: [
      { path: 'logo.png', status: 'modified', additions: 0, deletions: 0, whole: true, noise: false, binary: true,
        patch: 'Binary files a/logo.png and b/logo.png differ\n' },
    ],
    totals: { files: 1, additions: 0, deletions: 0 },
  })
  const dom = runPage(data)
  assert.match(dom.byId.files.textContent, /Binary file/)
})

test('TEMPLATE_PATH resolves inside the package that ships it', () => {
  assert.ok(fs.existsSync(TEMPLATE_PATH), TEMPLATE_PATH)
  assert.ok(TEMPLATE_PATH.endsWith(path.join('assets', 'review', 'page.html')))
})

// --- the review round-trip: marks, notes, replies, blob ---------------------

const {
  validateNotesBlob,
  mergeNotes,
  emptyNotes,
} = require('../src/env/review.js')

// The fixture above predates the marks, so it carries none of their fields —
// which is itself worth keeping: it is the page rendering a spec with no notes.
function marked(overrides = {}) {
  const base = fixture()
  base.notes = { version: 1, updatedAt: null, totals: { accepted: 0, lapsed: 0, unresolved: 0, resolved: 0 }, unanchored: [] }
  base.files = base.files.map((f) => ({ ...f, hash: 'h-' + f.path, accepted: false, acceptedAt: null, comments: [] }))
  return { ...base, ...overrides }
}

const accepts = (dom) => findAll(dom.byId.files, 'accept')
const gutters = (dom) => findAll(dom.byId.files, 'can-note')

// The editor is one shape everywhere: [textarea, [ok, cancel?]].
function writeNote(input, text) {
  input.value = text
  input.parentNode.childNodes[1].childNodes[0].dispatch('click')
}

// Take the blob the page ACTUALLY emits, through the button a person presses.
// There is no verdict-less control any more — every pass leaves the page having
// said something — so the marks-only tests below press the one that means
// "report it and stop", which is what they were always asking for.
function copyBlob(dom, verdict = 'discuss') {
  const before = dom.copied.length
  dom.byId['verdict-' + verdict].dispatch('click')
  assert.strictEqual(dom.copied.length, before + 1, 'the blob reached the clipboard')
  return JSON.parse(dom.copied[dom.copied.length - 1])
}

const countSays = (dom) => dom.byId['verdict-count'].textContent

// Every blob this file produces goes through the real validator. That is the
// whole point of driving the page rather than asserting on its source: the page
// and the engine cannot drift apart without a test here going red.
function accepted(blob, spec = 'feat-x') {
  return validateNotesBlob(blob, spec)
}

test('ticking accept sends the file and the hash it was read at', () => {
  const dom = runPage(marked())
  assert.match(countSays(dom), /Nothing marked/, 'nothing marked yet')
  accepts(dom)[0].dispatch('click')
  assert.strictEqual(countSays(dom), '1 mark to send')

  const blob = copyBlob(dom)
  accepted(blob)
  assert.deepStrictEqual(blob.accepted, [{ path: 'src/app.js', hash: 'h-src/app.js' }])
  assert.deepStrictEqual(blob.unaccepted, [])
})

test('an accept already recorded says nothing; withdrawing it is explicit', () => {
  const data = marked()
  data.files[0].accepted = true
  const dom = runPage(data)

  // Ticked on arrival, and nothing has changed — so there is nothing to send.
  assert.match(countSays(dom), /Nothing marked/)

  accepts(dom)[0].dispatch('click') // untick
  const blob = copyBlob(dom)
  accepted(blob)
  assert.deepStrictEqual(blob.accepted, [], 'no re-send of what is already stored')
  assert.deepStrictEqual(blob.unaccepted, ['src/app.js'], 'withdrawal cannot be expressed by absence')
})

test('a lapsed accept is shown as lapsed, and re-ticking re-sends the new hash', () => {
  const data = marked()
  data.files[0].accepted = 'lapsed'
  data.files[0].acceptedAt = '2020-01-01T00:00:00.000Z'
  const dom = runPage(data)

  const chips = findAll(dom.byId.files, 'lapsed')
  assert.strictEqual(chips.length, 1)
  assert.match(chips[0].textContent, /accepted earlier — changed since/)

  assert.strictEqual(accepts(dom)[0].getAttribute('aria-pressed'), 'false', 'a lapse is not a tick')
  accepts(dom)[0].dispatch('click')
  const blob = copyBlob(dom)
  accepted(blob)
  assert.deepStrictEqual(blob.accepted, [{ path: 'src/app.js', hash: 'h-src/app.js' }])
})

test('a comment from the gutter carries the line and the line it was about', () => {
  const dom = runPage(marked())
  const changed = gutters(dom).find((g) => g.textContent.includes('+'))
  changed.dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this needs the old value kept')

  const blob = copyBlob(dom)
  accepted(blob)
  assert.strictEqual(blob.comments.length, 1)
  const c = blob.comments[0]
  assert.strictEqual(c.file, 'src/app.js')
  assert.strictEqual(c.line, 61)
  assert.strictEqual(c.lineText, 'line 61 new', 'the text travels, so the note survives the line moving')
  assert.match(c.id, /^2020-01-01T00:00:00\.000Z-/, 'ids are minted from the render, so a re-paste merges')
})

test('a note about the whole file carries no line', () => {
  const dom = runPage(marked())
  const strip = findAll(dom.byId.files, 'strip')[0]
  strip.childNodes[strip.childNodes.length - 1].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'split this module')

  const blob = copyBlob(dom)
  accepted(blob)
  assert.strictEqual(blob.comments[0].line, null)
  assert.strictEqual(blob.comments[0].file, 'src/app.js')
})

test('a stored comment renders at its line, and the band hiding it is opened', () => {
  const data = marked()
  // Line 20 sits deep inside the collapsed run above the change.
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: 20, lineText: ' line 20', check: null, note: 'why this order?', raisedAt: 'T', resolved: null },
  ]
  const dom = runPage(data)
  const notes = findAll(dom.byId.files, 'note-row')
  assert.strictEqual(notes.length, 1, 'it is rendered')
  assert.match(notes[0].textContent, /line 20/)
  assert.match(notes[0].textContent, /why this order\?/)
  assert.doesNotMatch(notes[0].textContent, /not sent yet/, 'a stored note is already sent')
  const rows = findAll(dom.byId.files, 'has-note')
  assert.strictEqual(rows.length, 1, 'its line is marked')
})

test('a resolved comment is struck through and shows what was done', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: 61, lineText: 'line 61 new', check: null, note: 'hash this', raisedAt: 'T', resolved: { at: 'T2', note: 'keyed on the blob sha' } },
  ]
  const dom = runPage(data)
  const resolved = findAll(dom.byId.files, 'is-resolved')
  assert.strictEqual(resolved.length, 1)
  assert.match(resolved[0].textContent, /keyed on the blob sha/)
})

test('answering a check rides back tagged with the check and its file', () => {
  const dom = runPage(marked(), { checks: [{ id: 'k0', level: 'confirm', file: 'src/app.js' }] })
  const li = dom.document.querySelector('.check[data-check="k0"]')
  assert.ok(li, 'the reply box found the check')
  li.querySelector('.reply').childNodes[0].dispatch('click')
  writeNote(li.querySelector('.note-input'), 'yes — deliberate')

  const blob = copyBlob(dom)
  accepted(blob)
  const reply = blob.comments.find((c) => c.check === 'k0')
  assert.ok(reply, 'the answer is a comment carrying the check id')
  assert.strictEqual(reply.file, 'src/app.js')
  assert.strictEqual(reply.note, 'yes — deliberate')
})

test('a check with no file answers against the review itself, and still validates', () => {
  const dom = runPage(marked(), { checks: [{ id: 'k0', level: 'flag' }] })
  const li = dom.document.querySelector('.check[data-check="k0"]')
  li.querySelector('.reply').childNodes[0].dispatch('click')
  writeNote(li.querySelector('.note-input'), 'agreed')
  const blob = copyBlob(dom)
  accepted(blob)
  assert.strictEqual(blob.comments[0].file, '(review)', 'the sentinel keeps the blob valid')
})

test('what the page emits is what the engine stores', () => {
  const dom = runPage(marked())
  accepts(dom)[0].dispatch('click')
  gutters(dom).find((g) => g.textContent.includes('+')).dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'keep the old value')

  const blob = copyBlob(dom)
  const notes = mergeNotes(emptyNotes('feat-x'), accepted(blob), 'T1')
  assert.deepStrictEqual(notes.files['src/app.js'], { acceptedHash: 'h-src/app.js', acceptedAt: 'T1' })
  assert.strictEqual(notes.comments.length, 1)
  assert.strictEqual(notes.comments[0].line, 61)
})

test('a draft can be removed before it is ever sent', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'never mind')
  assert.strictEqual(copyBlob(dom).comments.length, 1, 'written')

  const row = findAll(dom.byId.files, 'note-row').find((r) => /not sent yet/.test(r.textContent))
  findAll(row, 'note-actions')[0].childNodes[0].dispatch('click')
  assert.strictEqual(copyBlob(dom).comments.length, 0)
})

test('the pass is autosaved, and storage that throws does not break the page', () => {
  const dom = runPage(marked())
  accepts(dom)[0].dispatch('click')
  const saved = JSON.parse(dom.store.get('skitterspec-review:feat-x:2020-01-01T00:00:00.000Z'))
  assert.strictEqual(saved.accepts['src/app.js'], true, 'a tab switch mid-review costs nothing')

  // Safari on file:// THROWS rather than returning null. A page that failed to
  // render because it could not autosave would be the worse bug by far.
  const blind = runPage(marked(), { failStorage: true })
  assert.ok(findAll(blind.byId.files, 'file').length > 0 || blind.byId.files.childNodes.length > 0, 'still renders')
  accepts(blind)[0].dispatch('click')
  assert.strictEqual(copyBlob(blind).accepted.length, 1, 'and still works')
})

test('with no clipboard the blob is offered as text instead', () => {
  const dom = runPage(marked(), { clipboard: false })
  accepts(dom)[0].dispatch('click')
  dom.byId['verdict-discuss'].dispatch('click')
  assert.strictEqual(dom.byId['copy-out'].hidden, false, 'the fallback is shown')
  accepted(JSON.parse(dom.byId['copy-out'].value))
  assert.match(dom.byId['copy-hint'].textContent, /paste it to Claude/)
})

test('a page with no marks at all emits nothing and says nothing', () => {
  const dom = runPage(marked())
  assert.match(countSays(dom), /Nothing marked/)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false, 'a clean read is committable')
  assert.strictEqual(dom.byId['verdict-log'].hidden, true, 'no verdict has been reached here')
  assert.deepStrictEqual(findAll(dom.byId.files, 'lapsed'), [], 'nothing is accused of being stale')
  assert.deepStrictEqual(findAll(dom.byId.files, 'note-row'), [])
})

test('a resolved comment is history, not an outstanding ask', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: 61, lineText: 'line 61 new', check: null, note: 'hash this', raisedAt: 'T', resolved: { at: 'T2', note: 'keyed on the blob sha' } },
    { id: 'c2', file: 'src/app.js', line: null, lineText: null, check: null, note: 'still open', raisedAt: 'T', resolved: null },
  ]
  const dom = runPage(data)
  // Neither counts: both were already sent. The count is what YOU have written
  // and not yet handed over, never a tally of outstanding work.
  assert.match(countSays(dom), /Nothing marked/)

  // The open one is advertised on the summary; the resolved one is not.
  const chips = findAll(dom.byId.files, 'commented')
  assert.strictEqual(chips.length, 1)
  assert.match(chips[0].textContent, /^1 note$/)
})

// --- the verdict bar --------------------------------------------------------

// Every verdict the page emits goes through the REAL validator, so the three
// buttons and the engine's accepted vocabulary cannot drift apart in silence.

test('each button sends its own verdict, and the engine accepts each', () => {
  // The page and the engine now speak the same words — phase 2 closed the gap
  // phase 1 opened deliberately. The tolerance for an older page's `approve`
  // lives in `env-review-verdict.test.js`, where it belongs: it is about a
  // stale tab, not about what this page sends.
  for (const verdict of ['commit', 'commit-continue', 'changes', 'discuss']) {
    const dom = runPage(marked())
    const blob = copyBlob(dom, verdict)
    assert.strictEqual(blob.verdict, verdict, 'the page sends what its button carries')
    assert.strictEqual(accepted(blob).verdict, verdict, 'and the engine reads it back unchanged')
  }
})

test('a verdict travels with the marks it was reached on', () => {
  const dom = runPage(marked())
  accepts(dom)[0].dispatch('click')
  const blob = copyBlob(dom, 'commit')
  assert.strictEqual(accepted(blob).verdict, 'commit', 'the engine reads the page word as the action')
  assert.deepStrictEqual(blob.accepted, [{ path: 'src/app.js', hash: 'h-src/app.js' }])
  accepted(blob)
})

test('committing is blocked while a note is open, and says so on both buttons', () => {
  const dom = runPage(marked())
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)

  gutters(dom).find((g) => g.textContent.includes('+')).dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'keep the old value')

  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)
  // The reason is IN THE LABEL. A dimmed button with the reason in a tooltip is
  // unreachable on the phone this page is read on.
  assert.match(dom.byId['verdict-commit'].textContent, /1 open note/)
  assert.strictEqual(dom.byId['verdict-changes'].disabled, false, 'changes is the point of a note')
  assert.strictEqual(dom.byId['verdict-discuss'].disabled, false)
})

test('a blocked commit emits nothing at all', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this one first')

  const before = dom.copied.length
  dom.byId['verdict-commit'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'the block is a fact, not a style')
  assert.strictEqual(dom.byId['copy-out'].hidden, true, 'and no fallback textarea either')
})

test('removing the last note re-enables committing, live', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'never mind')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)

  const row = findAll(dom.byId.files, 'note-row').find((r) => /not sent yet/.test(r.textContent))
  findAll(row, 'note-actions')[0].childNodes[0].dispatch('click')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false, 'the bar describes the pass as it stands')
  assert.strictEqual(dom.byId['verdict-commit'].textContent, '✓ Commit')
})

test('a stored comment the agent has not answered blocks committing too', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: null, lineText: null, check: null, note: 'still open', raisedAt: 'T', resolved: null },
  ]
  data.notes.totals.unresolved = 1
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)
  assert.match(dom.byId['verdict-commit'].textContent, /1 open note/)
})

test('a comment the agent resolved does not block committing', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: null, lineText: null, check: null, note: 'done', raisedAt: 'T', resolved: { at: 'T2', note: 'fixed' } },
  ]
  data.notes.totals.resolved = 1
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
})

// STAYS SILENT: the healthy-but-unusual input for the one accusing control on
// this page. A 60-file phase read straight through and approved without ticking
// a thing is an ordinary review, not an incomplete one — Decision 3.
test('unaccepted files never block committing, however many there are', () => {
  const data = marked()
  data.notes.totals.unresolved = 0
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false, 'ticking is not a gate')
  const blob = copyBlob(dom, 'commit')
  assert.deepStrictEqual(blob.accepted, [], 'and nothing had to be ticked to send it')
  accepted(blob)
})

test('the last decision is shown as history beneath the bar', () => {
  const data = marked()
  data.notes.lastDecision = { verdict: 'approve', at: '2026-09-14T10:00:00.000Z', note: 'committed a1b2c3d' }
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-log'].hidden, false)
  assert.match(dom.byId['verdict-log'].textContent, /approved earlier/)
  assert.match(dom.byId['verdict-log'].textContent, /2026-09-14/)
  assert.match(dom.byId['verdict-log'].textContent, /committed a1b2c3d/)
})

test('the verdict bar sits after the diff, not above it', () => {
  // POSITIONAL, on the template text. The bar began in the header and the first
  // person to use it could not find it: you read the diff downward and the
  // control asking for your conclusion was off-screen above you. A later edit
  // that tidies it back into the header re-creates exactly that, so the order
  // is pinned rather than left to prose.
  const files = TEMPLATE.indexOf('<div id="files">')
  const bar = TEMPLATE.indexOf('id="verdict-commit"')
  assert.ok(files > -1 && bar > -1, 'both are present')
  assert.ok(bar > files, 'the verdict comes after the thing it is a verdict on')
  // And the whole pass travels with it — the fallback textarea a `file://`
  // reader depends on must not be left behind in the header.
  assert.ok(TEMPLATE.indexOf('id="copy-out"') > files, 'the clipboard fallback moved too')
})

// --- sending, and falling back ----------------------------------------------
//
// Driven through the real page against the REAL validator, as every other
// round-trip test here is: the page and the engine cannot drift apart without
// one of these going red.

const pressed = (dom, verdict = 'discuss') => dom.byId['verdict-' + verdict].dispatch('click')

// The posting path answers on a promise, so anything it sets is written after
// the click returns. `setImmediate` runs once the microtask queue has drained,
// which is the shortest honest wait — a fixed delay would be a guess.
const settled = () => new Promise((r) => setImmediate(r))

test('a served page posts the pass to its own URL', () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  accepts(dom)[0].dispatch('click')
  pressed(dom, 'commit')

  assert.strictEqual(dom.posted.length, 1, 'it went over the wire')
  assert.strictEqual(dom.copied.length, 0, 'and not to the clipboard')
  const sent = dom.posted[0]
  assert.strictEqual(sent.url, '/tok/feat-x', "the page's own path, so there is no second address")
  assert.strictEqual(sent.method, 'POST')
  // The REAL validator, on the body the page actually sent.
  const blob = JSON.parse(sent.body)
  accepted(blob)
  assert.strictEqual(blob.verdict, 'commit')
  assert.deepStrictEqual(blob.accepted, [{ path: 'src/app.js', hash: 'h-src/app.js' }])
})

test('the command is handed over where the verdict was pressed', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  pressed(dom, 'discuss')
  await settled()
  // The code used to be read out for CHECKING, back when the agent went looking
  // for a pass and had to prove which one it had. It is handed over as the whole
  // command now — the reader's next action, not a number to compare.
  assert.match(dom.byId['copy-hint'].textContent, /Sent/)
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false, 'the command is offered')
  assert.strictEqual(dom.byId['sent-cmd-text'].value, '/spec-reviewed 418207')
  assert.doesNotMatch(dom.byId['copy-hint'].textContent, /claim it with/, 'it asks for no transcription')
})

// ── Phase 2 of feat-page-hands-you-the-command ───────────────────────────────

test('with a clipboard, Copy is offered and puts the command on it verbatim', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  pressed(dom, 'commit')
  await settled()
  const btn = dom.byId['sent-cmd-copy']
  assert.strictEqual(btn.hidden, false, 'the button exists where it can work')
  btn.dispatch('click')
  await settled()
  assert.deepStrictEqual(dom.copied, ['/spec-reviewed 418207'], 'verbatim, code included')
  assert.match(btn.textContent, /Copied/)
})

// The ordinary case on a LAN-served page: `navigator.clipboard` is
// secure-context-only and `http://<lan-ip>:7777` is not a secure context.
test('with no clipboard the command is shown and selected, and says so', async () => {
  const dom = runPage(marked(), { protocol: 'http:', clipboard: false })
  pressed(dom, 'commit')
  await settled()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false)
  assert.strictEqual(dom.byId['sent-cmd-text'].value, '/spec-reviewed 418207')
  // A reader who sees nothing happen cannot tell a page that did the work from
  // one that did nothing, so the selection is announced rather than silent.
  assert.match(dom.byId['copy-hint'].textContent, /selected/i)
})

// NEVER A BUTTON THAT CANNOT COPY. Decided from the capability, not from trying
// and failing — a control that does nothing on tap reads as a broken page.
test('no Copy control appears when the clipboard API is absent', async () => {
  const dom = runPage(marked(), { protocol: 'http:', clipboard: false })
  pressed(dom, 'commit')
  await settled()
  assert.strictEqual(dom.byId['sent-cmd-copy'].hidden, true)
})

// A server that answered without a code cannot have its pass addressed, so the
// page does not invent an address for it.
test('no code means no command, and the bare instruction instead', async () => {
  const dom = runPage(marked(), {
    protocol: 'http:',
    fetchWith: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }),
  })
  pressed(dom, 'commit')
  await settled()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, true)
  assert.match(dom.byId['copy-hint'].textContent, /run \/spec-reviewed to pick it up/)
})

// STAYS SILENT (`negative-checks.md` rule 3), twice over: a page that sent
// nothing shows no command, and the `file://` path never had a code to offer.
test('stays silent: nothing sent shows no command, and file:// is untouched', () => {
  const fresh = runPage(marked(), { protocol: 'http:' })
  assert.strictEqual(fresh.byId['sent-cmd'].hidden, true, 'nothing offered before a verdict')

  const local = runPage(marked())
  pressed(local, 'commit')
  assert.strictEqual(local.byId['sent-cmd'].hidden, true, 'no command on a file:// page')
  assert.strictEqual(local.copied.length, 1, 'it copied the blob, exactly as before')
})

test('a refused pass offers no command to run', async () => {
  const dom = runPage(marked(), {
    protocol: 'http:',
    fetchWith: () => Promise.resolve({ ok: false, status: 422, text: () => Promise.resolve('nope') }),
  })
  pressed(dom, 'commit')
  await settled()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, true, 'nothing was held, so nothing to claim')
})

test('a refused pass is shown, not swallowed', async () => {
  // A pass the server rejected must never read as sent — the engine's message
  // names the entry that was wrong, so it is relayed rather than summarised.
  const dom = runPage(marked(), {
    protocol: 'http:',
    fetchWith: () =>
      Promise.resolve({
        ok: false,
        status: 422,
        text: () => Promise.resolve('verdict "aprove" is not one of approve, changes, discuss'),
      }),
  })
  pressed(dom, 'commit')
  await settled()
  assert.match(dom.byId['copy-hint'].textContent, /Not sent/)
  assert.match(dom.byId['copy-hint'].textContent, /verdict "aprove" is not one of/)
})

test('an unreachable server falls back to the clipboard rather than losing the pass', async () => {
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: () => Promise.reject(new Error('gone')) })
  pressed(dom, 'discuss')
  await settled()
  assert.strictEqual(dom.byId['copy-out'].hidden, false, 'the blob is recoverable')
  assert.match(dom.byId['copy-hint'].textContent, /Could not reach the server/)
  accepted(JSON.parse(dom.byId['copy-out'].value))
})

// STAYS SILENT (`negative-checks.md` rule 3). A `file://` page has no server to
// talk to and never will, so it must behave exactly as it did before any of
// this existed — the clipboard path is not deprecated, it is the whole story
// for a local reader.
test('stays silent: a file:// page still copies, and never reaches for fetch', () => {
  const dom = runPage(marked())
  accepts(dom)[0].dispatch('click')
  pressed(dom, 'changes')
  assert.strictEqual(dom.posted.length, 0, 'no request was attempted')
  assert.strictEqual(dom.copied.length, 1, 'it went to the clipboard as always')
  const blob = JSON.parse(dom.copied[0])
  accepted(blob)
  assert.strictEqual(blob.verdict, 'changes')
})

test('the marks stay put after sending — a pass is not spent until it is claimed', () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  accepts(dom)[0].dispatch('click')
  assert.strictEqual(countSays(dom), '1 mark to send')
  pressed(dom, 'discuss')
  // Clearing here would be the page lying about state it does not own: the
  // engine holds the pass, and only a claim spends it.
  assert.strictEqual(countSays(dom), '1 mark to send')
  assert.strictEqual(accepts(dom)[0].getAttribute('aria-pressed'), 'true')
})

test('the decision is not re-judged on the way out', () => {
  // Approve is blocked while a note is open, and that block is the page's only
  // refusal. It must hold on the posting path exactly as it does on the copying
  // one — nothing may become sendable merely by being sent differently.
  const dom = runPage(marked(), { protocol: 'http:' })
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this first')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)
  pressed(dom, 'commit')
  assert.strictEqual(dom.posted.length, 0, 'the block is a fact on every path')
})

// --- the four buttons (feat-verdict-is-the-action phase 2) -------------------

test('the page offers four verdicts, labelled for what they do', () => {
  assert.match(TEMPLATE, /id="verdict-commit"[^>]*>✓ Commit</)
  assert.match(TEMPLATE, /id="verdict-commit-continue"[^>]*>✓ Commit &amp; Continue</)
  assert.match(TEMPLATE, /id="verdict-changes"/)
  assert.match(TEMPLATE, /id="verdict-discuss"/)
})

// THE PAIRING IS THE POINT. Two committing controls blocked by two separate
// reads is how a page ends up with one disabled and the other not — which would
// be a way around the single refusal this page makes.
test('both committing buttons block and unblock together, off one count', () => {
  const dom = runPage(marked())
  const commit = () => dom.byId['verdict-commit']
  const cont = () => dom.byId['verdict-commit-continue']
  assert.strictEqual(commit().disabled, false)
  assert.strictEqual(cont().disabled, false)

  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this first')
  assert.strictEqual(commit().disabled, true, 'commit is blocked')
  assert.strictEqual(cont().disabled, true, 'and so is commit & continue')
  // The reason is on BOTH labels, not just the first.
  assert.match(commit().textContent, /1 open note/)
  assert.match(cont().textContent, /1 open note/)

  const row = findAll(dom.byId.files, 'note-row').find((r) => /not sent yet/.test(r.textContent))
  findAll(row, 'note-actions')[0].childNodes[0].dispatch('click')
  assert.strictEqual(commit().disabled, false, 'both come back')
  assert.strictEqual(cont().disabled, false)
  assert.strictEqual(commit().textContent, '✓ Commit')
  assert.strictEqual(cont().textContent, '✓ Commit & Continue')
})

test('a blocked commit-continue emits nothing either', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this first')
  const before = dom.copied.length
  dom.byId['verdict-commit-continue'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'the block is a fact on both, not just on commit')
})

test('continue says what it will not do', () => {
  // A reader must not press it expecting the spec to be finished and landed —
  // `/spec-next` builds the next phase and stops there.
  assert.match(TEMPLATE, /then build the next phase — nothing is landed/)
})

// STAYS SILENT (`negative-checks.md` rule 3). The two that ask for something
// are never blocked, and nothing about ticking files blocks anything — Decisions
// 1 and 3 of `feat-review-verdict` are untouched by a fourth button.
test('stays silent: changes, discuss and unticked files block nothing', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'a note')
  assert.strictEqual(dom.byId['verdict-changes'].disabled, false)
  assert.strictEqual(dom.byId['verdict-discuss'].disabled, false)

  const clean = runPage(marked())
  for (const id of ['verdict-commit', 'verdict-commit-continue']) {
    assert.strictEqual(clean.byId[id].disabled, false, `${id} needs no ticks`)
  }
})

test('the committing pair is named once, so a fifth verdict cannot slip the block', () => {
  // The same reason the engine keeps a COMMITTING list rather than a second
  // condition: adding a committing verdict means adding it to one place.
  assert.match(TEMPLATE, /var COMMITTERS = \['commit', 'commit-continue'\]/)
  assert.match(TEMPLATE, /COMMITTERS\.forEach/)
  // And the old per-button form is gone, not merely unused.
  assert.doesNotMatch(TEMPLATE, /verdictBtns\.approve/)
})

// --- the page names the command, not the arrangement it replaced ------------
//
// `/spec-reviewed` shipped and the page went on describing the interim
// arrangement it replaced: narrate that a pass exists and hope the agent looks.
// Copy that names no command is copy that makes the operator invent one.

test('the sent message names /spec-reviewed', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  pressed(dom, 'commit')
  await settled()
  const hint = dom.byId['copy-hint'].textContent
  const cmd = dom.byId['sent-cmd-text'].value
  // The command moved OUT of the hint and into a field the reader can copy —
  // the hint introduces it. Both halves are asserted so neither can vanish.
  assert.match(cmd, /\/spec-reviewed/, 'it names the command to type')
  assert.match(cmd, /418207/, 'carrying the code, so the pass is addressed')
  assert.match(hint, /Run this/, 'and the hint points at it')
  assert.doesNotMatch(hint, /tell Claude it is waiting/, 'the old arrangement is gone')
})

// --- the button reasons from the phases (feat-page-knows-the-phase) ---------
//
// The operator opened the four-button bar on a COMPLETED spec — nought files,
// "Nothing to review" — and was offered a continue with nothing to continue
// into. One question answers it and the last-phase case together.

const phased = (over) => marked({ phases: over })

test('commit & continue is disabled, with its reason, when no phase is left', () => {
  const dom = runPage(phased({ total: 3, done: 3, hasNextPhase: false }))
  const cont = dom.byId['verdict-commit-continue']
  assert.strictEqual(cont.disabled, true)
  assert.match(cont.textContent, /no phase left/, 'the reason is on the control')
  assert.match(cont.title, /nothing left to build/i)
  // `✓ Commit` is untouched: a clean read still commits, and a finished spec is
  // still a legitimate thing to read.
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
  assert.strictEqual(dom.byId['verdict-commit'].textContent, '✓ Commit')
})

test('a spec with a phase left is offered the continue', () => {
  const dom = runPage(phased({ total: 3, done: 1, hasNextPhase: true }))
  assert.strictEqual(dom.byId['verdict-commit-continue'].disabled, false)
  assert.strictEqual(dom.byId['verdict-commit-continue'].textContent, '✓ Commit & Continue')
})

// CANNOT TELL IS NOT A NO (`negative-checks.md` rules 1 and 4). A spec whose
// phases the engine could not read — a legacy layout, inline phases — must keep
// the button it has always had.
test('stays silent: no phases key leaves both buttons exactly as they were', () => {
  const dom = runPage(marked())
  assert.ok(!('phases' in marked()), 'the fixture carries none')
  assert.strictEqual(dom.byId['verdict-commit-continue'].disabled, false)
  assert.strictEqual(dom.byId['verdict-commit-continue'].textContent, '✓ Commit & Continue')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
})

// TWO REASONS, ONE LABEL. The open note is the one the reader can act on, so it
// wins — a "no phase left" in its place would send them to fix the wrong thing.
test('an open note outranks no-phase-left on the label', () => {
  const dom = runPage(phased({ total: 2, done: 2, hasNextPhase: false }))
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this first')

  const cont = dom.byId['verdict-commit-continue']
  assert.strictEqual(cont.disabled, true)
  assert.match(cont.textContent, /1 open note/, 'the actionable reason wins')
  assert.doesNotMatch(cont.textContent, /no phase left/)
  // And commit is blocked by the note too, as it always was.
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true)
  assert.match(dom.byId['verdict-commit'].textContent, /1 open note/)
})

test('removing the note restores the no-phase reason, not the plain label', () => {
  const dom = runPage(phased({ total: 2, done: 2, hasNextPhase: false }))
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'never mind')
  const row = findAll(dom.byId.files, 'note-row').find((r) => /not sent yet/.test(r.textContent))
  findAll(row, 'note-actions')[0].childNodes[0].dispatch('click')

  assert.strictEqual(dom.byId['verdict-commit'].disabled, false, 'commit comes back')
  assert.strictEqual(dom.byId['verdict-commit-continue'].disabled, true, 'continue does not')
  assert.match(dom.byId['verdict-commit-continue'].textContent, /no phase left/)
})

test('a disabled continue emits nothing', () => {
  const dom = runPage(phased({ total: 1, done: 1, hasNextPhase: false }))
  const before = dom.copied.length
  dom.byId['verdict-commit-continue'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'the block is a fact, not a style')
})

test('the page asks the filesystem nothing — it reasons from what it was given', () => {
  // A static artefact spliced once. A page that read the filesystem would not be
  // one, and could not be opened from a phone at all.
  assert.match(TEMPLATE, /data\.phases\.hasNextPhase === false/)
  assert.match(TEMPLATE, /Boolean\(data\.phases\)/, 'absence is checked before the value')
})
