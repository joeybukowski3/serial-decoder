import fs from 'node:fs';
import vm from 'node:vm';

// Extracts only the `const LLD = {...};` object literal from
// large-loss-decoder.html, skipping the trailing DOMContentLoaded/init()
// bootstrap so tests can drive LLD's methods directly without a real DOM.
function extractLldSource(html) {
  const declIdx = html.indexOf('const LLD = {');
  if (declIdx === -1) {
    throw new Error('const LLD = {...} not found in large-loss-decoder.html');
  }
  const braceStart = html.indexOf('{', declIdx);
  let depth = 0;
  let i = braceStart;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) {
    throw new Error('Could not find matching closing brace for LLD object literal');
  }
  const objectLiteral = html.slice(braceStart, i + 1);
  return `globalThis.LLD = ${objectLiteral};`;
}

function createMockElement(tag, idRegistry) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    _id: '',
    className: '',
    _html: '',
    _value: '',
    _hidden: false,
    children: [],
    style: {},
    classList: {
      _set: new Set(),
      add(...names) { names.forEach(n => this._set.add(n)); },
      remove(...names) { names.forEach(n => this._set.delete(n)); },
      toggle(name, force) {
        const on = force === undefined ? !this._set.has(name) : !!force;
        if (on) this._set.add(name); else this._set.delete(name);
        return on;
      },
      contains(name) { return this._set.has(name); },
    },
    appendChild(child) { this.children.push(child); return child; },
    insertAdjacentElement() {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute(name, value) { this[`_attr_${name}`] = value; },
    removeAttribute(name) { delete this[`_attr_${name}`]; },
    getAttribute(name) { return this[`_attr_${name}`] ?? null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    focus() {},
    scrollIntoView() {},
    // Shallow containment check over the mock's own appendChild children --
    // sufficient for tests that only need "is X a descendant of this node".
    contains(node) {
      if (node === this) return true;
      return this.children.some((child) => child === node || (child.contains && child.contains(node)));
    },
    getBoundingClientRect() { return { left: 0, top: 0, bottom: 0, right: 0, width: 0, height: 0 }; },
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = v; },
  });
  Object.defineProperty(el, 'value', {
    get() { return this._value; },
    set(v) { this._value = v; },
  });
  Object.defineProperty(el, 'hidden', {
    get() { return this._hidden; },
    set(v) { this._hidden = v; },
  });
  // A real DOM's document.getElementById finds whatever element currently
  // owns that id. Registering on assignment (as production code does right
  // after createElement) keeps getElementById returning the SAME node
  // instead of a fresh throwaway mock every call.
  Object.defineProperty(el, 'id', {
    get() { return this._id; },
    set(v) {
      this._id = v;
      if (idRegistry && v) idRegistry.set(v, el);
    },
  });
  return el;
}

export function loadLargeLossContext() {
  const idRegistry = new Map();
  const ctx = {
    console,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    URL,
    URLSearchParams,
    fetch: async () => ({ ok: false, text: async () => '', json: async () => ({}) }),
    history: { pushState: () => {} },
    window: {
      location: { pathname: '/large-loss-decoder', search: '', href: 'http://localhost/large-loss-decoder', origin: 'http://localhost', replace: () => {} },
      addEventListener: () => {},
      scrollTo: () => {},
      innerHeight: 900,
    },
    document: {
      readyState: 'complete',
      head: { appendChild: () => {} },
      body: { appendChild: () => {}, classList: { toggle: () => {}, add: () => {}, remove: () => {} }, style: {} },
      documentElement: { clientHeight: 900 },
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => idRegistry.get(id) || null,
      createElement: (tag) => createMockElement(tag, idRegistry),
    },
    navigator: { clipboard: { writeText: async () => {} } },
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);

  vm.runInContext(fs.readFileSync('decoder-data.js', 'utf8'), ctx);
  vm.runInContext('globalThis.__decoderData = decoderData;', ctx);
  vm.runInContext(fs.readFileSync('script.js', 'utf8'), ctx);

  // Stand-in for the real <tbody id="tableBody"> that renderRow() appends
  // rows into.
  const tableBody = createMockElement('tbody', idRegistry);
  tableBody.id = 'tableBody';

  const html = fs.readFileSync('large-loss-decoder.html', 'utf8');
  vm.runInContext(extractLldSource(html), ctx);

  // Mirrors the one-time DOM setup init() does in the browser (creating the
  // shared floating listbox) without running the rest of init()'s
  // DOMContentLoaded-only side effects (addRow x5, global listeners).
  ctx.LLD.ensureBrandListbox();

  return { LLD: ctx.LLD, ctx, idRegistry };
}

export { extractLldSource };
