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

function createMockElement(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
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
  return el;
}

export function loadLargeLossContext() {
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
      getElementById: () => createMockElement('div'),
      createElement: (tag) => createMockElement(tag),
    },
    navigator: { clipboard: { writeText: async () => {} } },
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);

  vm.runInContext(fs.readFileSync('decoder-data.js', 'utf8'), ctx);
  vm.runInContext('globalThis.__decoderData = decoderData;', ctx);
  vm.runInContext(fs.readFileSync('script.js', 'utf8'), ctx);

  const html = fs.readFileSync('large-loss-decoder.html', 'utf8');
  vm.runInContext(extractLldSource(html), ctx);

  return { LLD: ctx.LLD, ctx };
}

export { extractLldSource };
