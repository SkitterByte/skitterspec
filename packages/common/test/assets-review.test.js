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
        for (const fn of node.listeners[ev] || []) fn({ target: node })
      },
      setAttribute(k, v) {
        node.attrs[k] = v
      },
      getAttribute(k) {
        return Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null
      },
      scrollIntoView() {},
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
  ]) {
    byId[id] = make('div')
    byId[id].id = id
  }
  // The noise checkbox must sit inside a `.toggle` for closest() to find it.
  const toggleLabel = make('label')
  toggleLabel.className = 'toggle'
  toggleLabel.appendChild(byId['show-noise'])

  const island = make('script')
  island.textContent = islandText
  byId['review-data'] = island

  const document = {
    documentElement: make('html'),
    createElement: make,
    createTextNode: (t) => ({ nodeValue: String(t), childNodes: [] }),
    getElementById: (id) => byId[id] || null,
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

  const window = { matchMedia: (q) => ({ matches: /min-width/.test(q) }) }
  return { document, window, byId }
}

function runPage(data) {
  const html = renderReviewPage(data)
  const island = /<script type="application\/json" id="review-data">([\s\S]*?)<\/script>/.exec(html)
  assert.ok(island, 'the island was not closed early')
  const dom = fakeDom(island[1])
  vm.runInNewContext(`(function (document, window) { ${pageScript()} })(document, window)`, {
    document: dom.document,
    window: dom.window,
    JSON,
    encodeURIComponent,
  })
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
