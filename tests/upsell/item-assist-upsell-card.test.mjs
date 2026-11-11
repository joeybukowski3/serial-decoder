import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Lightweight fake DOM element. Real attribute/child relationships aren't
// modeled — id/class lookups on innerHTML are resolved by scanning the
// markup string, which is enough to exercise ensureUpsellCard/renderUpsellCard
// without pulling in a full DOM implementation.
function makeEl(tag) {
  const el = {
    tagName: tag,
    id: '',
    className: '',
    open: false,
    href: '',
    textContent: '',
    style: {},
    attrs: {},
    children: [],
    _listeners: {},
    _html: '',
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); },
      contains(c) { return this._set.has(c); },
    },
    appendChild(child) { this.children.push(child); return child; },
    insertAdjacentElement(_pos, child) { this.children.push(child); return child; },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(type, handler) { (this._listeners[type] = this._listeners[type] || []).push(handler); },
    dispatchEvent(type) { (this._listeners[type] || []).forEach((h) => h()); },
    closest() { return null; },
    set innerHTML(v) {
      this._html = v;
      this._idNodes = {};
      this._classNodes = {};
      let m;
      const idRe = /id="([^"]+)"/g;
      while ((m = idRe.exec(v))) {
        const node = makeEl('span');
        node.id = m[1];
        this._idNodes[m[1]] = node;
      }
      const classRe = /class="([^"]+)"/g;
      while ((m = classRe.exec(v))) {
        m[1].split(/\s+/).forEach((cls) => {
          if (!this._classNodes[cls]) {
            const node = makeEl('div');
            node.className = m[1];
            this._classNodes[cls] = node;
          }
        });
      }
    },
    get innerHTML() { return this._html; },
    querySelector(sel) {
      if (sel.startsWith('#')) return (this._idNodes && this._idNodes[sel.slice(1)]) || null;
      if (sel.startsWith('.')) return (this._classNodes && this._classNodes[sel.slice(1)]) || null;
      return null;
    },
  };
  return el;
}

function makeContainer() {
  const el = makeEl('div');
  el.querySelector = function (sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      return this.children.find((c) => c.id === id) || null;
    }
    if (sel === '.results-body') return this._resultsBody || null;
    return null; // .result-warning / .serial-legacy-fields .determination-details: not present in this harness
  };
  return el;
}

function loadUpsellContext() {
  const analyticsCalls = [];
  const serialResults = makeContainer();
  const resultsBody = makeContainer();
  serialResults._resultsBody = resultsBody;

  const ctx = {
    console,
    setTimeout: (fn) => { fn(); return 0; },
    clearTimeout: () => {},
    URL,
    URLSearchParams,
    fetch: async () => ({ ok: false, text: async () => '', json: async () => ({}) }),
    history: { pushState: () => {} },
    window: {
      location: { pathname: '/', search: '', href: 'http://localhost/', origin: 'http://localhost', replace: () => {} },
      addEventListener: () => {},
      scrollTo: () => {},
      ItemAssistAnalytics: {
        track: (name, props) => { analyticsCalls.push({ name, props }); },
      },
    },
    document: {
      head: { appendChild: () => {} },
      body: { classList: { toggle() {}, add() {}, remove() {} }, style: {}, appendChild: () => {} },
      addEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => (id === 'serialResults' ? serialResults : null),
      createElement: (tag) => makeEl(tag),
    },
    navigator: { clipboard: { writeText: async () => {} } },
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx);

  vm.runInContext(fs.readFileSync('decoder-data.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('script.js', 'utf8'), ctx);

  return { ctx, analyticsCalls, resultsBody };
}

test('buildItemAssistReportUrl omits empty fields but always includes source', () => {
  const { ctx } = loadUpsellContext();
  const url = vm.runInContext('buildItemAssistReportUrl({})', ctx);
  assert.equal(url, 'https://itemassist.com/request-age-verification?source=decodemyitem');
});

test('buildItemAssistReportUrl never emits a serial param, even if one is passed in', () => {
  const { ctx } = loadUpsellContext();
  const url = vm.runInContext(
    'buildItemAssistReportUrl({ brand: "GE", model: "ABC123", serial: "SHOULD-NOT-APPEAR", category: "appliances", resultId: "r1", resultStatus: "resolved" })',
    ctx
  );
  assert.ok(!url.includes('serial'), `URL leaked a serial param: ${url}`);
  assert.ok(!url.includes('SHOULD-NOT-APPEAR'));
});

test('buildItemAssistReportUrl only ever includes the approved param set', () => {
  const { ctx } = loadUpsellContext();
  const url = vm.runInContext(
    'buildItemAssistReportUrl({ brand: "GE", model: "ABC123", category: "appliances", resultId: "r1", resultStatus: "resolved" })',
    ctx
  );
  const params = new URL(url).searchParams;
  assert.deepEqual(
    [...params.keys()].sort(),
    ['brand', 'category', 'model', 'result_id', 'result_status', 'source']
  );
  assert.equal(params.get('source'), 'decodemyitem');
});

test('buildItemAssistReportUrl safely encodes special characters', () => {
  const { ctx } = loadUpsellContext();
  const url = vm.runInContext(
    'buildItemAssistReportUrl({ brand: "GE Caf\\u00e9 & Co", model: "A/B 123?", category: "appliances", resultId: "r 1" })',
    ctx
  );
  const params = new URL(url).searchParams;
  assert.equal(params.get('brand'), 'GE Café & Co');
  assert.equal(params.get('model'), 'A/B 123?');
  assert.equal(params.get('result_id'), 'r 1');
  // The raw query string must not contain literal spaces, slashes, or "&" from values.
  assert.ok(!/\?.*brand=GE Caf/.test(url));
});

test('ensureUpsellCard is idempotent: repeated decodes never duplicate the card', () => {
  const { ctx, resultsBody } = loadUpsellContext();
  vm.runInContext('ensureUpsellCard()', ctx);
  vm.runInContext('ensureUpsellCard()', ctx);
  vm.runInContext('ensureUpsellCard()', ctx);
  const cards = resultsBody.children.filter((c) => c.id === 'itemAssistUpsellCard');
  assert.equal(cards.length, 1);
});

test('ensureUpsellCard reuses a mounted card when the mock has no querySelectorAll or cached reference', () => {
  const { ctx, resultsBody } = loadUpsellContext();
  const card = vm.runInContext('ensureUpsellCard()', ctx);
  vm.runInContext('lastUpsellCards = {}', ctx);
  assert.equal(vm.runInContext('ensureUpsellCard()', ctx), card);
  assert.equal(resultsBody.children.filter((child) => child.id === 'itemAssistUpsellCard').length, 1);
});

test('ensureUpsellCard removes duplicate mounted cards when querySelectorAll is available', () => {
  const { ctx } = loadUpsellContext();
  const card = vm.runInContext('ensureUpsellCard()', ctx);
  const duplicate = { remove() { this.removed = true; } };
  ctx.document.getElementById('serialResults').querySelectorAll = () => [card, duplicate];
  assert.equal(vm.runInContext('ensureUpsellCard()', ctx), card);
  assert.equal(duplicate.removed, true);
});

test('renderUpsellCard updates the same card in place for a second decoded item', () => {
  const { ctx, resultsBody } = loadUpsellContext();
  vm.runInContext(
    'renderUpsellCard("resolved", { brand: "GE", model: "GFW850", category: "appliances", resultId: "r1" })',
    ctx
  );
  const firstHref = vm.runInContext(
    'document.getElementById("serialResults").querySelector(".results-body").querySelector("#itemAssistUpsellCard").querySelector("#itemAssistUpsellCta").href',
    ctx
  );
  vm.runInContext(
    'renderUpsellCard("ambiguous", { brand: "Whirlpool", model: "WFE320M0JW0", category: "appliances", resultId: "r2" })',
    ctx
  );
  const secondHref = vm.runInContext(
    'document.getElementById("serialResults").querySelector(".results-body").querySelector("#itemAssistUpsellCard").querySelector("#itemAssistUpsellCta").href',
    ctx
  );
  const secondBody = vm.runInContext(
    'document.getElementById("serialResults").querySelector(".results-body").querySelector("#itemAssistUpsellCard").querySelector("#itemAssistUpsellBody").textContent',
    ctx
  );

  const cards = resultsBody.children.filter((c) => c.id === 'itemAssistUpsellCard');
  assert.equal(cards.length, 1, 'a second decode must not create a second card');
  assert.notEqual(firstHref, secondHref);
  assert.ok(secondHref.includes('brand=Whirlpool'));
  assert.ok(secondHref.includes('result_status=ambiguous'));
  assert.equal(secondBody, vm.runInContext('UPSELL_VARIANT_COPY.ambiguous', ctx));
});

for (const [variant, urlStatus] of [['resolved', 'resolved'], ['ambiguous', 'ambiguous'], ['noMatch', 'no_match']]) {
  test(`renderUpsellCard variant "${variant}" shows the matching copy and result_status`, () => {
    const { ctx } = loadUpsellContext();
    vm.runInContext(
      `renderUpsellCard(${JSON.stringify(variant)}, { brand: "GE", model: "M1", category: "appliances", resultId: "rid" })`,
      ctx
    );
    const bodyText = vm.runInContext(
      'document.getElementById("serialResults").querySelector(".results-body").querySelector("#itemAssistUpsellCard").querySelector("#itemAssistUpsellBody").textContent',
      ctx
    );
    const href = vm.runInContext(
      'document.getElementById("serialResults").querySelector(".results-body").querySelector("#itemAssistUpsellCard").querySelector("#itemAssistUpsellCta").href',
      ctx
    );
    assert.equal(bodyText, vm.runInContext(`UPSELL_VARIANT_COPY[${JSON.stringify(variant)}]`, ctx));
    assert.ok(href.includes(`result_status=${urlStatus}`));
    assert.ok(!href.includes('serial'));
  });
}

test('none of the upsell copy variants promise a specific manufacture year', () => {
  const { ctx } = loadUpsellContext();
  const copy = vm.runInContext('UPSELL_VARIANT_COPY', ctx);
  for (const [variant, text] of Object.entries(copy)) {
    assert.ok(!/\b(19|20)\d{2}\b/.test(text), `${variant} copy appears to cite a specific year: "${text}"`);
    assert.ok(!/\bguarantee/i.test(text), `${variant} copy should not use "guarantee": "${text}"`);
  }
});

test('the card has the review CTA and disclaimer without pricing details', () => {
  const { ctx } = loadUpsellContext();
  const card = vm.runInContext('ensureUpsellCard()', ctx);
  assert.ok(card.innerHTML.includes('Request Expert Review'));
  assert.ok(!card.innerHTML.includes('Pricing &amp; details'));
  assert.ok(!card.innerHTML.includes('<details'));
  assert.ok(card.innerHTML.includes('Not a manufacturer certification'));
});

test('analytics: card view fires once per render and never includes a serial', () => {
  const { ctx, analyticsCalls } = loadUpsellContext();
  vm.runInContext(
    'renderUpsellCard("resolved", { brand: "GE", model: "M1", serial: "SHOULD-NOT-APPEAR", category: "appliances", resultId: "rid" })',
    ctx
  );
  const viewed = analyticsCalls.filter((c) => c.name === 'item_assist_upsell_viewed');
  assert.equal(viewed.length, 1);
  assert.equal(viewed[0].props.resultStatus, 'resolved');
  for (const call of analyticsCalls) {
    assert.equal(Object.prototype.hasOwnProperty.call(call.props, 'serial'), false, `${call.name} must not carry a serial prop`);
    assert.ok(!JSON.stringify(call.props).includes('SHOULD-NOT-APPEAR'));
  }
});

test('analytics: a "viewed" event is not duplicated by an incidental rerender of the same result', () => {
  const { ctx, analyticsCalls } = loadUpsellContext();
  var call = 'renderUpsellCard("resolved", { brand: "GE", model: "M1", category: "appliances", resultId: "rid" })';
  vm.runInContext(call, ctx);
  vm.runInContext(call, ctx); // e.g. a duplicate paint/reflow calling the same render with identical context
  vm.runInContext(call, ctx);
  const viewed = analyticsCalls.filter((c) => c.name === 'item_assist_upsell_viewed');
  assert.equal(viewed.length, 1, 'identical rerenders of the same decode result must not refire "viewed"');

  // A genuinely new decode (fresh resultId) must still fire its own "viewed" event.
  vm.runInContext(
    'renderUpsellCard("ambiguous", { brand: "GE", model: "M1", category: "appliances", resultId: "rid-2" })',
    ctx
  );
  const viewedAfterNewDecode = analyticsCalls.filter((c) => c.name === 'item_assist_upsell_viewed');
  assert.equal(viewedAfterNewDecode.length, 2, 'a new decode result must fire a new "viewed" event');
});

test('analytics: card view and CTA click fire once without duplicate handlers across rerenders', () => {
  const { ctx, analyticsCalls } = loadUpsellContext();
  const render = 'renderUpsellCard("resolved", { brand: "GE", category: "appliances", resultId: "r1" })';
  vm.runInContext(render, ctx);
  vm.runInContext(render, ctx);
  vm.runInContext(render, ctx);
  vm.runInContext(`
    var cta = document.getElementById("serialResults").querySelector(".results-body").querySelector("#itemAssistUpsellCard").querySelector("#itemAssistUpsellCta");
    cta.dispatchEvent("click");
  `, ctx);

  const viewed = analyticsCalls.filter((c) => c.name === 'item_assist_upsell_viewed');
  const clicked = analyticsCalls.filter((c) => c.name === 'item_assist_upsell_clicked');
  assert.equal(viewed.length, 1);
  assert.equal(clicked.length, 1);
  assert.equal(clicked[0].props.resultStatus, 'resolved');
  assert.deepEqual(analyticsCalls.map((call) => call.name), ['item_assist_upsell_viewed', 'item_assist_upsell_clicked']);
});
