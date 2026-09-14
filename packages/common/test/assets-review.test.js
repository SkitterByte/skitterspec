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
    'verdict', 'verdict-approve', 'verdict-changes', 'verdict-discuss',
    'verdict-count', 'verdict-log', 'copy-out', 'copy-hint',
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

function runPage(data, { checks = [], failStorage = false, clipboard = true } = {}) {
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
  vm.runInNewContext(`(function (document, window, navigator) { ${pageScript()} })(document, window, navigator)`, {
    document: dom.document,
    window: dom.window,
    navigator,
    JSON,
    encodeURIComponent,
    Promise,
  })
  dom.copied = copied
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
  assert.strictEqual(dom.byId['verdict-approve'].disabled, false, 'a clean read is approvable')
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

test('each button sends its own verdict, and the engine accepts all three', () => {
  for (const verdict of ['approve', 'changes', 'discuss']) {
    const dom = runPage(marked())
    const blob = copyBlob(dom, verdict)
    assert.strictEqual(blob.verdict, verdict)
    assert.strictEqual(accepted(blob).verdict, verdict, 'the engine reads back what was pressed')
  }
})

test('a verdict travels with the marks it was reached on', () => {
  const dom = runPage(marked())
  accepts(dom)[0].dispatch('click')
  const blob = copyBlob(dom, 'approve')
  assert.strictEqual(blob.verdict, 'approve')
  assert.deepStrictEqual(blob.accepted, [{ path: 'src/app.js', hash: 'h-src/app.js' }])
  accepted(blob)
})

test('approve is blocked while a note is open, and says so on the button', () => {
  const dom = runPage(marked())
  assert.strictEqual(dom.byId['verdict-approve'].disabled, false)

  gutters(dom).find((g) => g.textContent.includes('+')).dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'keep the old value')

  assert.strictEqual(dom.byId['verdict-approve'].disabled, true)
  // The reason is IN THE LABEL. A dimmed button with the reason in a tooltip is
  // unreachable on the phone this page is read on.
  assert.match(dom.byId['verdict-approve'].textContent, /1 open note/)
  assert.strictEqual(dom.byId['verdict-changes'].disabled, false, 'changes is the point of a note')
  assert.strictEqual(dom.byId['verdict-discuss'].disabled, false)
})

test('a blocked approve emits nothing at all', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'this one first')

  const before = dom.copied.length
  dom.byId['verdict-approve'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'the block is a fact, not a style')
  assert.strictEqual(dom.byId['copy-out'].hidden, true, 'and no fallback textarea either')
})

test('removing the last note re-enables approve, live', () => {
  const dom = runPage(marked())
  gutters(dom)[0].dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'never mind')
  assert.strictEqual(dom.byId['verdict-approve'].disabled, true)

  const row = findAll(dom.byId.files, 'note-row').find((r) => /not sent yet/.test(r.textContent))
  findAll(row, 'note-actions')[0].childNodes[0].dispatch('click')
  assert.strictEqual(dom.byId['verdict-approve'].disabled, false, 'the bar describes the pass as it stands')
  assert.strictEqual(dom.byId['verdict-approve'].textContent, '✓ Approve')
})

test('a stored comment the agent has not answered blocks approve too', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: null, lineText: null, check: null, note: 'still open', raisedAt: 'T', resolved: null },
  ]
  data.notes.totals.unresolved = 1
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-approve'].disabled, true)
  assert.match(dom.byId['verdict-approve'].textContent, /1 open note/)
})

test('a comment the agent resolved does not block approve', () => {
  const data = marked()
  data.files[0].comments = [
    { id: 'c1', file: 'src/app.js', line: null, lineText: null, check: null, note: 'done', raisedAt: 'T', resolved: { at: 'T2', note: 'fixed' } },
  ]
  data.notes.totals.resolved = 1
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-approve'].disabled, false)
})

// STAYS SILENT: the healthy-but-unusual input for the one accusing control on
// this page. A 60-file phase read straight through and approved without ticking
// a thing is an ordinary review, not an incomplete one — Decision 3.
test('unaccepted files never block approve, however many there are', () => {
  const data = marked()
  data.notes.totals.unresolved = 0
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-approve'].disabled, false, 'ticking is not a gate')
  const blob = copyBlob(dom, 'approve')
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
