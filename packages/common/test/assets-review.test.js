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
    'verdict', 'verdict-commit', 'verdict-commit-continue', 'verdict-continue',
    'verdict-changes', 'verdict-discuss',
    'verdict-count', 'verdict-log', 'copy-out', 'copy-hint',
    'sent-cmd', 'sent-cmd-lead', 'sent-cmd-text', 'sent-cmd-copy',
    'context', 'context-why', 'context-more', 'context-more-summary', 'context-rest',
    'wrap', 'decided', 'decided-what', 'decided-note', 'decided-toggle', 'drawn-by',
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

  // A selection, enough for the page's one use of it: the command box has no
  // `select()` any more, so the fallback goes through a Range — and a shim that
  // simply lacked `createRange` would send every test down the could-not-select
  // branch and never touch the one that ships.
  const selection = { ranges: [], removeAllRanges() { this.ranges = [] }, addRange(r) { this.ranges.push(r) } }
  const document = {
    documentElement: make('html'),
    createElement: make,
    createRange: () => ({ node: null, selectNodeContents(n) { this.node = n } }),
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
    getSelection: () => selection,
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
  return { document, window, byId, store, selection }
}

function runPage(data, { checks = [], failStorage = false, clipboard = true, protocol = 'file:', fetchWith = null, claudeUse = null, storage = null, noSelection = false } = {}) {
  const html = renderReviewPage(data)
  const island = /<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/.exec(html)
  assert.ok(island, 'the island was not closed early')
  const dom = fakeDom(island[1])
  // A SECOND PAGE OVER THE SAME STORAGE is how a reader re-opening their tab is
  // modelled — the decision has to outlive the page object, not just the call.
  if (storage) dom.window.localStorage = storage
  if (failStorage) dom.window.localStorage._fail = true
  if (noSelection) dom.window.getSelection = () => null
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
  // A PUBLISHED page is distinguished by `window.claude.use` being there at
  // all, so the shim grows one only when a test asks for it — every other test
  // keeps describing a page the engine served.
  if (claudeUse) dom.window.claude = { use: claudeUse }
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
      // The page stamps a pass with the moment it was sent. The sandbox was
      // simply missing the global, not the page reaching for something it
      // should not have.
      Date,
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
  // A sidecar written before the rename says `approve`, and it means the same
  // thing the engine reads it as: a commit. The page says what HAPPENED, so it
  // says committed — it used to say "approved", which described the button
  // rather than the outcome.
  data.notes.lastDecision = { verdict: 'approve', at: '2026-09-14T10:00:00.000Z', note: 'committed a1b2c3d' }
  const dom = runPage(data)
  assert.strictEqual(dom.byId['verdict-log'].hidden, false)
  assert.match(dom.byId['verdict-log'].textContent, /committed earlier/)
  assert.match(dom.byId['verdict-log'].textContent, /2026-09-14/)
  assert.match(dom.byId['verdict-log'].textContent, /committed a1b2c3d/)
})

test('every verdict is named, and an unknown one says so', () => {
  // THE FALLBACK WAS A LIE. Anything the page did not recognise read as
  // "discussed" — including `commit`, the commonest verdict there is — so the
  // history line could tell you a commit was a conversation.
  for (const [verdict, said] of [
    ['commit', /committed earlier/],
    ['commit-continue', /committed, then carried on/],
    ['changes', /changes requested/],
    ['discuss', /discussed earlier/],
  ]) {
    const data = marked()
    data.notes.lastDecision = { verdict, at: '2026-09-14T10:00:00.000Z', note: null }
    assert.match(runPage(data).byId['verdict-log'].textContent, said, verdict)
  }
  const odd = marked()
  odd.notes.lastDecision = { verdict: 'something-new', at: '2026-09-14T10:00:00.000Z', note: null }
  assert.match(runPage(odd).byId['verdict-log'].textContent, /recorded as "something-new"/)
})

test('a skip reads as a skip, with its reason', () => {
  // The page's answer to "was this read and moved past, or never read at all?"
  // A skip that did not show would make those two states identical.
  const data = marked()
  data.gate = { armed: false, armedAt: null, phase: '2', lastSkip: { at: '2026-09-14T11:00:00.000Z', reason: 'docs only' } }
  const dom = runPage(data)
  assert.match(dom.byId['verdict-log'].textContent, /moved on without a verdict/)
  assert.match(dom.byId['verdict-log'].textContent, /docs only/)
})

test('the more recent of a verdict and a skip is the one shown', () => {
  const data = marked()
  data.notes.lastDecision = { verdict: 'commit', at: '2026-09-14T10:00:00.000Z', note: null }
  data.gate = { armed: true, armedAt: null, phase: '3', lastSkip: { at: '2026-09-13T10:00:00.000Z', reason: 'older' } }
  assert.match(runPage(data).byId['verdict-log'].textContent, /committed earlier/, 'the newer verdict wins')

  const other = marked()
  other.notes.lastDecision = { verdict: 'commit', at: '2026-09-13T10:00:00.000Z', note: null }
  other.gate = { armed: true, armedAt: null, phase: '3', lastSkip: { at: '2026-09-14T10:00:00.000Z', reason: 'newer' } }
  assert.match(runPage(other).byId['verdict-log'].textContent, /moved on without a verdict/)
})

test('the verdict bar sits after the diff, not above it', () => {
  // POSITIONAL, on the template text. The bar began in the header and the first
  // person to use it could not find it: you read the diff downward and the
  // control asking for your conclusion was off-screen above you. A later edit
  // that tidies it back into the header re-creates exactly that, so the order
  // is pinned rather than left to prose.
  const files = TEMPLATE.search(/<div id="files"/)
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
  // Once the page has ESTABLISHED that nobody picked the pass up. It used to be
  // handed over on every send, which is what taught the reader to ignore it.
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: polling(['waiting']).fetchWith })
  pressed(dom, 'discuss')
  await drained()
  // The code used to be read out for CHECKING, back when the agent went looking
  // for a pass and had to prove which one it had. It is handed over as the whole
  // command now — the reader's next action, not a number to compare.
  assert.match(dom.byId['decided-what'].textContent, /You chose/)
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false, 'the command is offered')
  assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
  assert.doesNotMatch(dom.byId['sent-cmd-lead'].textContent, /claim it with/, 'it asks for no transcription')
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
  const dom = runPage(marked(), { protocol: 'http:', clipboard: false, fetchWith: polling(['waiting']).fetchWith })
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false)
  assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
  // A reader who sees nothing happen cannot tell a page that did the work from
  // one that did nothing, so the selection is announced rather than silent —
  // on the box's own lead line, which is beside it. It was appended to the
  // footer hint, which is now half a page away from the thing it described.
  assert.match(dom.byId['sent-cmd-lead'].textContent, /selected/i)
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
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: polling(['waiting']).fetchWith })
  pressed(dom, 'commit')
  await drained()
  const lead = dom.byId['sent-cmd-lead'].textContent
  const cmd = dom.byId['sent-cmd-text'].textContent
  // The command moved OUT of the sentence and into a field the reader can copy —
  // the lead introduces it. Both halves are asserted so neither can vanish.
  assert.match(cmd, /\/spec-reviewed/, 'it names the command to type')
  assert.match(cmd, /418207/, 'carrying the code, so the pass is addressed')
  assert.match(lead, /Run this/, 'and the lead points at it')
  assert.doesNotMatch(lead, /tell Claude it is waiting/, 'the old arrangement is gone')
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

// ── Phase 1 of feat-seamless-review-loop ─────────────────────────────────────
//
// The page opened on a file list and said nothing about what the change was
// for. A reviewer on a phone met `page.html +18 −4` with no statement of the
// problem or the surfaces it touches — the two things a pull request puts above
// the diff, because nobody can review a change they must reconstruct first.

const CONTEXT = {
  problem: 'The lead paragraph, which is the one that stays open.\n\nA second paragraph that folds away.',
  impact: { rows: [{ surface: 'Engine', change: 'update', detail: 'collectReview — context' }] },
  phase: {
    n: 2,
    title: 'The report ends in a choice',
    goal: 'the terminal is a third way to finish a review',
    tasks: [{ done: true, text: 'Amend spec-reports.md' }, { done: false, text: 'Offer it from /spec-diff' }],
  },
}
const withContext = (over) => marked({ context: { ...CONTEXT, ...over } })

test('the header carries the problem, the impact rows and the live phase', () => {
  const dom = runPage(withContext())
  assert.strictEqual(dom.byId['context'].hidden, false, 'the header is shown')

  const why = dom.byId['context-why'].textContent
  assert.match(why, /The lead paragraph/, 'the problem leads')

  const rest = dom.byId['context-rest'].textContent
  assert.match(rest, /A second paragraph/, 'the remainder folds away, it is not dropped')
  assert.match(rest, /collectReview — context/, 'the impact detail is there')
  assert.match(rest, /Engine/)
  assert.match(rest, /update/)
  assert.match(rest, /Phase 2 — The report ends in a choice/)
  assert.match(rest, /third way to finish a review/, 'the goal')
  assert.match(rest, /Amend spec-reports\.md/, 'and the tasks')
})

// A PHONE SHOWS ABOUT SIX LINES before the file list is pushed off-screen, and
// pushing it off is precisely what this header must not do.
test('only the lead paragraph is open; the rest is behind a fold', () => {
  const dom = runPage(withContext())
  assert.strictEqual(dom.byId['context-more'].hidden, false, 'there is a fold')
  assert.doesNotMatch(dom.byId['context-why'].textContent, /A second paragraph/)
  assert.doesNotMatch(dom.byId['context-why'].textContent, /Phase 2/)
})

test('a done task reads differently from one still open', () => {
  const dom = runPage(withContext())
  const rest = dom.byId['context-rest'].textContent
  assert.match(rest, /✅ Amend spec-reports\.md/)
  assert.match(rest, /⬜ Offer it from \/spec-diff/)
})

test('each part is optional — a problem with no impact and no phase still draws', () => {
  const dom = runPage(marked({ context: { problem: 'Only this.' } }))
  assert.strictEqual(dom.byId['context'].hidden, false)
  assert.match(dom.byId['context-why'].textContent, /Only this/)
  // Nothing folded away, so there is nothing to offer a fold for.
  assert.strictEqual(dom.byId['context-more'].hidden, true)
})

test('a spec touching no external surface says so, rather than showing an empty table', () => {
  const dom = runPage(marked({ context: { impact: { prose: 'No external surface changes — internal refactor only.' } } }))
  assert.match(dom.byId['context-rest'].textContent, /No external surface changes/)
})

// STAYS SILENT (`negative-checks.md` rule 3). A legacy bare `<name>.md`, an
// overview with inline phases, a spec with no `## Problem` — all yield no
// context at all, and the page must render exactly as it did before this.
test('stays silent: no context means no header, not an empty one', () => {
  const dom = runPage(marked())
  assert.strictEqual(dom.byId['context'].hidden, true, 'nothing is shown')
  assert.strictEqual(dom.byId['context-why'].textContent, '', 'and nothing was drawn')
  assert.ok(dom.byId.files.childNodes.length > 0, 'the file list is untouched')
})

// The header is markdown out of a spec file — anything someone typed — and this
// page is served over the network. Built with createElement so a spec's prose
// can never reach the DOM as markup.
test('the header is built as text, never spliced as markup', () => {
  const dom = runPage(marked({ context: { problem: '<img src=x onerror=alert(1)> and <b>bold</b>' } }))
  const why = dom.byId['context-why']
  assert.match(why.textContent, /<img src=x/, 'it is shown verbatim, as text')
  assert.strictEqual(findAll(why, 'anything').length, 0, 'no elements were parsed out of it')
  assert.doesNotMatch(TEMPLATE, /context-why[\s\S]{0,400}innerHTML/, 'and it never reaches for innerHTML')
})

// --- the third transport: a published page, for a reader off the LAN --------
//
// The engine serves on a LAN address, which a phone on mobile data cannot
// reach — and a published page's POST would go to claude.ai and fail. So a
// page that finds itself published hands the pass to the artifact's own store
// instead, where Claude reads it back and deletes it.

// A stand-in for the artifact runtime: `use('db')` resolving to a store that
// records what was written.
function fakeClaude({ db = true } = {}) {
  const added = []
  const use = (name) => {
    if (name !== 'db' || !db) return Promise.resolve(null)
    return Promise.resolve({
      collection: (path) => ({
        add: (doc) => {
          added.push({ path, doc })
          return Promise.resolve({ id: 'doc1' })
        },
      }),
    })
  }
  return { use, added }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

test('a published page stores the pass instead of posting it', async () => {
  const claude = fakeClaude()
  const dom = runPage(marked(), { protocol: 'https:', claudeUse: claude.use })
  dom.byId['verdict-discuss'].dispatch('click')
  await settle()

  assert.strictEqual(claude.added.length, 1)
  assert.strictEqual(claude.added[0].path, 'passes')
  assert.strictEqual(claude.added[0].doc.blob.verdict, 'discuss')
  assert.strictEqual(claude.added[0].doc.spec, 'feat-x')
  // The POST is the trap this branch exists to avoid: on a published page it
  // would go to claude.ai, fail, and surface as "could not reach the server".
  assert.deepStrictEqual(dom.posted, [])
  assert.match(dom.byId['copy-hint'].textContent, /Sent/)
})

test('a stored pass names the render it came from, so its age can be read', () => {
  // Age is how a stranger's pass gives itself away, and a published page has
  // no six-digit code to carry that for it.
  const claude = fakeClaude()
  const data = marked()
  const dom = runPage(data, { protocol: 'https:', claudeUse: claude.use })
  dom.byId['verdict-discuss'].dispatch('click')
  return settle().then(() => {
    assert.strictEqual(claude.added[0].doc.render, data.generatedAt)
    assert.ok(claude.added[0].doc.at, 'and when it was sent')
  })
})

test('a published page with no store falls back to the clipboard, never silence', async () => {
  const claude = fakeClaude({ db: false })
  const dom = runPage(marked(), { protocol: 'https:', claudeUse: claude.use, clipboard: false })
  dom.byId['verdict-discuss'].dispatch('click')
  await settle()
  // Recoverable rather than lost: the reader's work is on screen to copy.
  assert.strictEqual(dom.byId['copy-out'].hidden, false)
  assert.match(dom.byId['copy-hint'].textContent, /Could not reach the store/)
})

// STAYS SILENT. Adding a transport must not change the two that existed — and
// the check is presence of `window.claude`, so a served page never waits on a
// capability that is never coming.
test('a served page still posts, exactly as before', () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-discuss'].dispatch('click')
  assert.strictEqual(dom.posted.length, 1)
  assert.strictEqual(dom.posted[0].url, '/tok/feat-x')
})

test('a file:// page still copies, exactly as before', () => {
  const dom = runPage(marked(), { protocol: 'file:' })
  dom.byId['verdict-discuss'].dispatch('click')
  assert.strictEqual(dom.copied.length, 1)
  assert.deepStrictEqual(dom.posted, [])
})

// --- the review ends when the verdict is delivered --------------------------
//
// The page used to carry on as if nothing had happened: the diff stayed, all
// four buttons stayed live, and a line of small grey text under them said
// "Sent." A reader returning to that tab could not tell a sent review from an
// unsent one, and pressing again reached an agent that had stopped listening.

const decidedOn = (dom) => dom.byId['decided'].hidden === false

test('a delivered verdict ends the review and says what was chosen', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()

  assert.ok(decidedOn(dom), 'the panel is shown')
  assert.match(dom.byId['decided-what'].textContent, /You chose: ✓ Commit/)
  assert.match(dom.byId['decided-note'].textContent, /Sent to Claude/)
  // The diff is faded out by a class rather than a timer, so nothing depends on
  // JavaScript finishing an animation.
  assert.match(dom.byId['wrap'].className, /\bis-decided\b/)
})

test('every verdict button dies, with the reason on it', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  for (const key of ['commit', 'commit-continue', 'changes', 'discuss']) {
    const btn = dom.byId['verdict-' + key]
    assert.strictEqual(btn.disabled, true, key)
    assert.match(btn.title, /Already sent/, key)
  }
  // `refresh` re-enables the non-committing pair unconditionally, so a decided
  // page has to beat it — this is the assertion that catches that regression.
  assert.match(dom.byId['verdict-count'].textContent, /Sent —/)
})

test('the decision survives a reload of the same render', async () => {
  const data = marked()
  const first = runPage(data, { protocol: 'http:' })
  first.byId['verdict-changes'].dispatch('click')
  await settle()
  // A second page over the SAME storage — the reader re-opening their tab.
  const again = runPage(data, { protocol: 'http:', storage: first.window.localStorage })
  assert.ok(decidedOn(again))
  assert.match(again.byId['decided-what'].textContent, /Request changes/)
  assert.strictEqual(again.byId['verdict-commit'].disabled, true)
})

test('the next render is a live page again', async () => {
  // Keyed to the render, like every other mark: after the commit the phase
  // re-renders, and that page is not finished just because the last one was.
  const first = runPage(marked(), { protocol: 'http:' })
  first.byId['verdict-commit'].dispatch('click')
  await settle()
  const next = marked()
  next.generatedAt = '2027-01-01T00:00:00.000Z'
  const fresh = runPage(next, { protocol: 'http:', storage: first.window.localStorage })
  assert.strictEqual(decidedOn(fresh), false)
  assert.strictEqual(fresh.byId['verdict-commit'].disabled, false)
})

test('there is a way back to the diff, and the buttons stay dead there', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  dom.byId['decided-toggle'].dispatch('click')
  assert.match(dom.byId['wrap'].className, /\bshow-diff\b/, 'the diff comes back')
  assert.match(dom.byId['wrap'].className, /\bis-decided\b/, 'and it is still decided')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, true, 'so the buttons stay closed')
  assert.match(dom.byId['decided-toggle'].textContent, /Hide the diff/)
})

test('a stored pass ends the review the same way', () => {
  const claude = fakeClaude()
  const dom = runPage(marked(), { protocol: 'https:', claudeUse: claude.use })
  dom.byId['verdict-discuss'].dispatch('click')
  return settle().then(() => {
    assert.ok(decidedOn(dom))
    assert.match(dom.byId['decided-what'].textContent, /Discuss first/)
  })
})

// STAYS SILENT. A clipboard copy is NOT a delivery — the pass is in the
// reader's hands, not Claude's — so ending the page there would claim
// something was handed over when the reader still has to paste it.
test('a clipboard copy does not end the review', async () => {
  const dom = runPage(marked(), { protocol: 'file:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  assert.strictEqual(decidedOn(dom), false)
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
})

test('a refused pass does not end the review either', () => {
  const dom = runPage(marked(), {
    protocol: 'http:',
    fetchWith: () => Promise.resolve({ ok: false, status: 400, text: () => Promise.resolve('bad blob') }),
  })
  dom.byId['verdict-commit'].dispatch('click')
  return settle().then(() => {
    assert.strictEqual(decidedOn(dom), false, 'nothing was accepted, so nothing was decided')
    assert.match(dom.byId['copy-hint'].textContent, /Not sent/)
  })
})

// --- the ending says it ONCE ------------------------------------------------
//
// The decided page said the same thing four times: the panel, the verdict bar,
// the history line and a command box with a Copy button. The panel is the
// ending; the rest either earns its place or goes.

test('a code keeps its box, because six digits are worth copying', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false)
  assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
})

test('a bare command is a sentence, not a copyable artefact', async () => {
  // The store transport has no code to hand back, and `/spec-reviewed` is a
  // word you type into the terminal you are already in. A Copy button for it
  // makes a finished page look unfinished.
  const claude = fakeClaude()
  const dom = runPage(marked(), { protocol: 'https:', claudeUse: claude.use })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, true, 'no command box')
  assert.strictEqual(dom.byId['copy-hint'].hidden, true, 'and no hint above it')
  // The instruction is not lost — it is a clause in the panel, where the rest
  // of the ending already is.
  assert.match(dom.byId['decided-note'].textContent, /run \/spec-reviewed where it is/)
})

test('the history line goes quiet once the panel says the same thing', async () => {
  const dom = runPage(marked(), { protocol: 'http:' })
  dom.byId['verdict-commit'].dispatch('click')
  await settle()
  assert.strictEqual(dom.byId['verdict-log'].hidden, true)
  // And the panel is still the one that speaks.
  assert.match(dom.byId['decided-what'].textContent, /You chose/)
})

// A `display` rule beats the browser's `[hidden] { display: none }`, so an
// element the page hides in JavaScript stays on screen unless its class carries
// an explicit override. This is invisible to every other test here — the DOM
// shim has no CSS, so `hidden = true` "works" — and it shipped: a finished
// review kept showing an empty command box because `.sent-cmd` is `display:
// flex`. So the guard reads the stylesheet rather than the behaviour.
test('anything the page hides has a [hidden] override where it needs one', () => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(TEMPLATE)[1]
  // Classes the template ships hidden, or that the page hides at runtime.
  const hides = new Set()
  for (const tag of TEMPLATE.match(/<[^>]*\shidden(\s|>|=)[^>]*>/g) || []) {
    const cls = /\bclass="([^"]+)"/.exec(tag)
    if (cls) for (const c of cls[1].split(/\s+/)) hides.add(c)
  }
  assert.ok(hides.size > 0, 'the template ships some hidden elements')

  const offenders = []
  for (const cls of hides) {
    // Does any rule give this class a display other than none?
    const sets = new RegExp(`\\.${cls}\\s*\\{[^}]*display:\\s*(?!none)`, 'g').test(css)
    if (!sets) continue
    const guarded = new RegExp(`\\.${cls}\\[hidden\\]\\s*\\{[^}]*display:\\s*none`).test(css)
    if (!guarded) offenders.push(cls)
  }
  assert.deepStrictEqual(
    offenders,
    [],
    `these classes set a display and would ignore [hidden]:\n  .${offenders.join('\n  .')}`,
  )
})

// The provenance line exists so a page drawn by a stale renderer can be caught
// by reading the artefact. A working copy carries `0.0.0` — the unpublished
// source package's version — and printing that verbatim answers the question
// with a version that has never existed.
test('a working copy says so rather than claiming a version', () => {
  const dev = fixture()
  dev.engine = '0.0.0'
  assert.match(runPage(dev).byId['drawn-by'].textContent, /skitterspec \(unreleased build\)/)

  const released = fixture()
  released.engine = '18.0.0'
  assert.match(runPage(released).byId['drawn-by'].textContent, /skitterspec 18\.0\.0/)
})

// --- the button set ---------------------------------------------------------

// The set is DECLARED by the render, not derived from the gate — see
// `BUTTON_SETS` in `env/review.js` for why deriving it is wrong.

test('a mid-run page offers Continue instead of the committing pair', () => {
  const dom = runPage(marked({ buttons: 'midrun' }))
  assert.strictEqual(dom.byId['verdict-continue'].hidden, false, 'Continue is offered')
  assert.strictEqual(dom.byId['verdict-commit'].hidden, true, '"commit" is the wrong verb for unfinished work')
  assert.strictEqual(dom.byId['verdict-commit-continue'].hidden, true)
  // The two that ask for something are in BOTH sets — a note you want acted on,
  // and a question, are never the wrong thing to send at any point in a run.
  assert.strictEqual(dom.byId['verdict-changes'].hidden, false)
  assert.strictEqual(dom.byId['verdict-discuss'].hidden, false)
})

test('Continue sends its own verdict, and the engine accepts it', () => {
  const dom = runPage(marked({ buttons: 'midrun' }))
  const blob = copyBlob(dom, 'continue')
  assert.strictEqual(blob.verdict, 'continue', 'the page sends what its button carries')
  assert.strictEqual(accepted(blob).verdict, 'continue', 'and the engine reads it back unchanged')
})

test('Continue is never blocked by an open note, exactly as the engine is not', () => {
  // The engine refuses only a COMMITTING verdict against an open comment, and
  // `continue` is deliberately not one. A disabled button here would be the
  // page holding a second opinion about a refusal the engine does not make.
  const dom = runPage(marked({ buttons: 'midrun' }))
  gutters(dom).find((g) => g.textContent.includes('+')).dispatch('click')
  writeNote(findAll(dom.byId.files, 'note-input')[0], 'worth a look later')
  assert.strictEqual(dom.byId['verdict-continue'].disabled, false)
  assert.strictEqual(accepted(copyBlob(dom, 'continue')).verdict, 'continue')
})

test('a mid-run page says what a clean read does, and it is not committing', () => {
  assert.strictEqual(countSays(runPage(marked({ buttons: 'midrun' }))), 'Nothing marked — a clean read still carries on')
  assert.strictEqual(countSays(runPage(marked())), 'Nothing marked — a clean read still commits')
})

test('a verdict this render never offered cannot be reached by dispatching at it', () => {
  // The button set is a fact, not a style — the same rule the disabled block
  // already follows. A browser will not fire a hidden control; every other
  // caller is what this guards.
  const dom = runPage(marked({ buttons: 'midrun' }))
  const before = dom.copied.length
  dom.byId['verdict-commit'].dispatch('click')
  assert.strictEqual(dom.copied.length, before, 'nothing was emitted')
  assert.strictEqual(dom.byId['copy-out'].hidden, true, 'and no fallback textarea either')
})

// STAYS SILENT (`negative-checks.md` rule 3). A page that did not opt in is the
// page it has always been: same four controls, same labels, same states — and
// the mid-run control is not merely dimmed on it, it is absent.
test('stays silent: a render with no button set is the committing page, unchanged', () => {
  const dom = runPage(marked())
  assert.strictEqual(dom.byId['verdict-commit'].hidden, false)
  assert.strictEqual(dom.byId['verdict-commit-continue'].hidden, false)
  assert.strictEqual(dom.byId['verdict-changes'].hidden, false)
  assert.strictEqual(dom.byId['verdict-discuss'].hidden, false)
  assert.strictEqual(dom.byId['verdict-continue'].hidden, true, 'and Continue is not on it at all')
  assert.strictEqual(dom.byId['verdict-commit'].textContent, '✓ Commit')
  assert.strictEqual(dom.byId['verdict-commit'].disabled, false)
})

// And the rejected alternative in decision 4, on the page's side of the wire: a
// project running `review.required: false` never arms, and its pages must still
// offer a commit.
test('an unarmed gate does not take the committing buttons away', () => {
  const dom = runPage(marked())
  assert.strictEqual(dom.byId['verdict-commit'].hidden, false)
  const armed = runPage(marked({ gate: { state: 'armed', phase: 1, armedAt: 'T' }, buttons: 'midrun' }))
  assert.strictEqual(armed.byId['verdict-continue'].hidden, false, 'and an armed one does not force them on')
  assert.strictEqual(armed.byId['verdict-commit'].hidden, true)
})

// ── bug-page-cannot-tell-if-claimed ──────────────────────────────────────────
//
// A successful POST used to end on `Sent. Run this where Claude is:` — the same
// sentence whether a session was waiting to claim the pass or nothing was. The
// page cannot know that at send time, so it stopped guessing and started
// ASKING: it polls its own URL for the code it was given, and says the one
// thing that is true.
//
// WHAT WOULD FOOL THIS: a poll that reads "claimed" from the code being ABSENT.
// A store that moved, a spec path typo, a corrupt sidecar read as empty — all
// three are absences, and all three would quietly tell the reader Claude has
// their pass when nobody has it. So the quiet ending fires on a POSITIVE
// `claimed`, and every other answer — including one that cannot tell — hands
// over the command.

// The poll answer, as the server gives it. `settled()` alone is not enough:
// each poll is a fresh promise chain, so the queue has to drain per round.
const drained = async (n = 4) => { for (let i = 0; i < n; i++) await settled() }

function polling(states) {
  const asked = []
  const queue = states.slice()
  return {
    asked,
    fetchWith: (url, opts) => {
      if (opts && opts.method === 'POST') {
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{"code":"418207"}') })
      }
      asked.push(url)
      const next = queue.length > 1 ? queue.shift() : queue[0]
      if (next === 'boom') return Promise.reject(new Error('offline'))
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify({ state: next })) })
    },
  }
}

test('a sent pass is checked, not guessed about', async () => {
  const p = polling(['waiting'])
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: p.fetchWith })
  pressed(dom, 'commit')
  await drained()
  assert.ok(p.asked.length >= 1, 'the page asked what became of the pass')
  assert.strictEqual(p.asked[0], '/tok/feat-x?pass=418207', 'its own path, carrying the code it was given')
})

test('a pass Claude picked up names no command at all', async () => {
  const p = polling(['claimed'])
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: p.fetchWith })
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, true, 'nothing for the reader to run')
  assert.match(dom.byId['decided-note'].textContent, /picked (it|this) up/i)
  assert.doesNotMatch(dom.byId['decided-note'].textContent, /Run this where Claude is/)
})

test('a pass still sitting there hands over the command, loudly', async () => {
  const p = polling(['waiting'])
  const dom = runPage(marked(), { protocol: 'http:', fetchWith: p.fetchWith })
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false, 'the command is handed over')
  assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
  assert.match(dom.byId['decided-note'].textContent, /still waiting/i, 'and it says why')
})

// WHERE it sits is a fact about the markup, so it is asserted on the markup.
// The shim cannot parse the spliced template, so every element it makes is a
// root — `closest()` would answer `null` for a correctly nested box and for a
// missing one alike, which is no assertion at all.
test('the command box lives inside the You chose panel, marked as an action', () => {
  const decided = /<section class="decided" id="decided"[\s\S]*?<\/section>/.exec(TEMPLATE)
  assert.ok(decided, 'the decided panel is there')
  assert.match(decided[0], /id="sent-cmd"/, 'the command box sits in it')
  assert.match(decided[0], /class="sent-cmd act"/, 'marked as an action, not a note')
  // And nowhere else: two boxes with one id is a page that hides the wrong one.
  assert.strictEqual((TEMPLATE.match(/id="sent-cmd"/g) || []).length, 1)
  // The callout has to be visible in both themes, so it may only use tokens the
  // bare `:root` defines — the whole-template check guards that, and this one
  // guards that it is actually filled rather than another grey line.
  assert.match(TEMPLATE, /\.sent-cmd\.act\s*\{[^}]*background:\s*var\(--add-bg\)/)
})

// The command is TEXT. A readonly input still reads as a field to type into,
// and on a phone tapping one raises a keyboard for a value nobody can change.
test('the command is plain text with a Copy control, not a form field', () => {
  const box = /<code class="sent-cmd-text" id="sent-cmd-text"><\/code>/.exec(TEMPLATE)
  assert.ok(box, 'the command is a <code> element, empty until the page fills it')
  assert.doesNotMatch(TEMPLATE, /<input[^>]*id="sent-cmd-text"/, 'and never an input')
  // One tap takes the whole command, which is the gesture that still works on a
  // page served over plain http — where the clipboard API is withheld.
  assert.match(TEMPLATE, /\.sent-cmd-text\s*\{[^}]*user-select:\s*all/)
  assert.match(TEMPLATE, /id="sent-cmd-copy"/, 'the Copy control is still there')
})

test('Copy takes what is on screen, and the clipboardless path selects it', async () => {
  const withCopy = runPage(marked(), { protocol: 'http:', fetchWith: polling(['waiting']).fetchWith })
  pressed(withCopy, 'commit')
  await drained()
  withCopy.byId['sent-cmd-copy'].dispatch('click')
  await drained()
  assert.deepStrictEqual(withCopy.copied, ['/spec-reviewed 418207'], 'the text, verbatim')

  const bare = runPage(marked(), { protocol: 'http:', clipboard: false, fetchWith: polling(['waiting']).fetchWith })
  pressed(bare, 'commit')
  await drained()
  assert.strictEqual(bare.selection.ranges.length, 1, 'the command really was selected')
  assert.strictEqual(bare.selection.ranges[0].node, bare.byId['sent-cmd-text'])
})

// Rule 4 again, on a smaller thing: a browser with no selection at all must not
// be told its text is highlighted. A reader hunting for a highlight that is not
// there is worse off than one who was simply asked to copy.
test('a page that cannot select says copy it, and never claims it selected', async () => {
  const dom = runPage(marked(), {
    protocol: 'http:', clipboard: false, fetchWith: polling(['waiting']).fetchWith, noSelection: true,
  })
  pressed(dom, 'commit')
  await drained()
  assert.strictEqual(dom.byId['sent-cmd'].hidden, false, 'the command is still handed over')
  assert.match(dom.byId['sent-cmd-lead'].textContent, /copy it/i)
  assert.doesNotMatch(dom.byId['sent-cmd-lead'].textContent, /selected/i)
})

// Rule 4 of `.claude/rules/negative-checks.md`: three states, and the one that
// cannot tell goes to the harmless branch. A command nobody needs to run costs
// a glance; a pass nobody claims costs the review.
test('a poll that cannot tell hands over the command rather than claiming silence', async () => {
  for (const answer of ['boom', 'unknown', 'nonsense']) {
    const p = polling([answer])
    const dom = runPage(marked(), { protocol: 'http:', fetchWith: p.fetchWith })
    pressed(dom, 'commit')
    await drained()
    assert.strictEqual(dom.byId['sent-cmd'].hidden, false, `${answer}: the command survives`)
    assert.strictEqual(dom.byId['sent-cmd-text'].textContent, '/spec-reviewed 418207')
  }
})
