import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../../lookup-completion-analytics.js', import.meta.url), 'utf8');
const decoderSource = await readFile(new URL('../../script.js', import.meta.url), 'utf8');
const homepageSource = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const brandMirrorSource = await readFile(new URL('../../ge.html', import.meta.url), 'utf8');

function createHarness(pathname = '/index.html') {
  const calls = [];
  const document = {
    body: { getAttribute() { return ''; } },
  };
  const window = {
    location: { pathname },
    gtag(...args) { calls.push(args); },
  };
  const context = vm.createContext({ window, document, Boolean, Number, String, Object, Array, Math, isFinite });
  vm.runInContext(source, context, { filename: 'lookup-completion-analytics.js' });
  return { api: window.DecodeMyItemAnalytics, calls };
}

function eventCalls(calls, name) {
  return calls.filter((call) => call[0] === 'event' && call[1] === name);
}

function decode(harness, resultStatus, extra = {}) {
  const attempt = harness.api.beginDecodeAttempt({ brand: 'GE', category: 'appliances' });
  harness.api.completeDecodeAttempt(attempt, {
    result_status: resultStatus,
    result_precision: resultStatus === 'ambiguous' ? 'candidate-years' : 'year-month',
    date_precision: resultStatus === 'ambiguous' ? 'multiple-candidates' : 'month-year',
    candidate_year_count: resultStatus === 'ambiguous' ? 3 : 1,
    ambiguous: resultStatus === 'ambiguous',
    refinement_used: false,
    evidence_type: 'serial-rule',
    ...extra,
  });
  return attempt;
}

test('resolved decode emits one start, complete, and compatibility success', () => {
  const harness = createHarness();
  decode(harness, 'resolved');
  assert.equal(eventCalls(harness.calls, 'decode_start').length, 1);
  assert.equal(eventCalls(harness.calls, 'decode_complete').length, 1);
  assert.equal(eventCalls(harness.calls, 'decode_success').length, 1);
  assert.equal(eventCalls(harness.calls, 'decode_fail').length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(eventCalls(harness.calls, 'decode_start')[0][2])), {
    event_version: '2', lookup_type: 'serial-decode', decoder_path: 'homepage', brand: 'ge', category: 'appliances',
  });
});

test('GE-style ambiguous decode is useful and is neither success nor failure', () => {
  const harness = createHarness();
  decode(harness, 'ambiguous');
  assert.equal(eventCalls(harness.calls, 'decode_start').length, 1);
  assert.equal(eventCalls(harness.calls, 'decode_complete').length, 1);
  assert.equal(eventCalls(harness.calls, 'decode_success').length, 0);
  assert.equal(eventCalls(harness.calls, 'decode_fail').length, 0);
  assert.equal(eventCalls(harness.calls, 'decode_complete')[0][2].candidate_year_count, 3);
});

test('unsupported and invalid decodes each emit one controlled failure', () => {
  for (const status of ['unsupported', 'invalid']) {
    const harness = createHarness();
    decode(harness, status);
    assert.equal(eventCalls(harness.calls, 'decode_start').length, 1, status);
    assert.equal(eventCalls(harness.calls, 'decode_complete').length, 1, status);
    assert.equal(eventCalls(harness.calls, 'decode_fail').length, 1, status);
    assert.equal(eventCalls(harness.calls, 'decode_fail')[0][2].failure_type, status);
  }
});

test('decoder exception completes once as error and never exposes the error', () => {
  const harness = createHarness();
  const attempt = decode(harness, 'error', { error: 'provider raw error fixture', raw_error: 'private stack' });
  harness.api.completeDecodeAttempt(attempt, { result_status: 'resolved' });
  assert.equal(eventCalls(harness.calls, 'decode_complete').length, 1);
  assert.equal(eventCalls(harness.calls, 'decode_fail').length, 1);
  assert.equal(eventCalls(harness.calls, 'decode_fail')[0][2].failure_type, 'error');
  assert.doesNotMatch(JSON.stringify(harness.calls), /provider raw error fixture|private stack/);
});

test('Maytag dual-era and unsupported attempts maintain matching lifecycle counts', () => {
  const dual = createHarness('/maytag.html');
  decode(dual, 'ambiguous');
  assert.equal(eventCalls(dual.calls, 'decode_start').length, eventCalls(dual.calls, 'decode_complete').length);

  const unsupported = createHarness('/maytag.html');
  decode(unsupported, 'unsupported');
  assert.equal(eventCalls(unsupported.calls, 'decode_start').length, 1);
  assert.equal(eventCalls(unsupported.calls, 'decode_complete').length, 1);
  assert.equal(eventCalls(unsupported.calls, 'decode_fail').length, 1);
});

test('each submission mechanism uses the same attempt contract and retries get new attempts', () => {
  assert.match(homepageSource, /id="decodeBtn"[^>]+onclick="decodeSerial\(\)"/);
  assert.match(brandMirrorSource, /id="decodeBtn"[^>]+onclick="decodeSerial\(\)"/);
  assert.match(decoderSource, /addEventListener\("keypress",function\(e\)\{"Enter"===e\.key&&decodeSerial\(\)\}\)/);

  for (const mechanism of ['button', 'enter', 'brand-mirror']) {
    const harness = createHarness(mechanism === 'brand-mirror' ? '/ge.html' : '/index.html');
    decode(harness, 'resolved');
    decode(harness, 'resolved');
    assert.equal(eventCalls(harness.calls, 'decode_start').length, 2, mechanism);
    assert.equal(eventCalls(harness.calls, 'decode_complete').length, 2, mechanism);
    assert.equal(eventCalls(harness.calls, 'decode_success').length, 2, mechanism);
  }
});

test('rerender or refinement cannot complete an attempt twice', () => {
  const harness = createHarness();
  const attempt = decode(harness, 'ambiguous');
  assert.equal(harness.api.completeDecodeAttempt(attempt, { result_status: 'resolved', refinement_used: true }), false);
  assert.equal(eventCalls(harness.calls, 'decode_complete').length, 1);
});

test('Smart terminal outcomes complete once with structured replacement availability', () => {
  for (const status of ['resolved', 'partial', 'conflict', 'no-result', 'error']) {
    for (const replacement of [true, false]) {
      const harness = createHarness('/smart-lookup.html');
      const attempt = harness.api.beginSmartAttempt();
      const outcome = {
        result_status: status,
        identity_level: 'exact-model',
        brand: 'Samsung',
        category: 'electronics',
        evidence_type: 'grounded',
        local_evidence_hit: false,
        grounded_result: true,
        deterministic_fallback_used: status === 'partial',
        provider_attempted: true,
        age_result_available: status !== 'no-result' && status !== 'error',
        replacement_result_available: replacement,
        clarification_recommended: status === 'partial',
        conflict_detected: status === 'conflict',
        timeout_with_useful_fallback: status === 'partial',
      };
      assert.equal(harness.api.completeSmartAttempt(attempt, outcome), true);
      assert.equal(harness.api.completeSmartAttempt(attempt, outcome), false);
      const completion = eventCalls(harness.calls, 'smart_lookup_complete');
      assert.equal(completion.length, 1, `${status}/${replacement}`);
      assert.equal(completion[0][2].replacement_result_available, replacement);
      assert.equal(completion[0][2].event_version, '2');
      assert.equal(completion[0][2].lookup_type, 'smart-lookup');
    }
  }
});

test('decoder_path is controlled by page context', () => {
  const fixtures = [
    ['/index.html', 'homepage'],
    ['/ge-serial-number-lookup.html', 'brand-lookup'],
    ['/ge.html', 'legacy-brand'],
    ['/how-to-read-serial-number.html', 'guide'],
    ['/decoder-tool.html', 'embedded-tool'],
  ];
  fixtures.forEach(([pathname, expected]) => assert.equal(createHarness(pathname).api.decoderPath(), expected));
});

test('no DOM observer or submission listener remains in the completion helper', () => {
  assert.doesNotMatch(source, /MutationObserver|addEventListener\(['"](?:click|keydown)/);
});
