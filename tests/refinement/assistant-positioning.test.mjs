import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../assistant.html', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../../api/assistant-chat.js', import.meta.url), 'utf8');

test('age-decoding prompt chips are removed from the Assistant hero', () => {
  assert.doesNotMatch(html, /Age from serial number/, 'the age-estimate chip must not remain');
  assert.doesNotMatch(html, /Decode a serial/, 'the decode-a-serial chip must not remain');
  assert.doesNotMatch(html, /How old is my Whirlpool refrigerator with serial number/, 'the age-estimate prefill prompt must not remain');
  assert.doesNotMatch(html, /Decode this Goodman serial number/, 'the decode-a-serial prefill prompt must not remain');
});

test('conversational use cases remain prominent as chips', () => {
  assert.match(html, /Explain my result/);
  assert.match(html, /Repair vs replace/);
  assert.match(html, /Find the label/);
  assert.match(html, /Which tool should I use\?/);
  assert.match(html, /Replacement options/);
});

test('the page visibly directs age-research users to the Decoder or Smart Lookup', () => {
  assert.match(html, /class="ai-guardrail"/, 'a guardrail element must exist in the hero');
  const guardrailSection = html.slice(html.indexOf('class="ai-guardrail"') - 50, html.indexOf('class="ai-guardrail"') + 400);
  assert.match(guardrailSection, /href="\/decoder-tool"/);
  assert.match(guardrailSection, /href="\/smart-lookup"/);
  assert.match(guardrailSection, /manufacture dates|production years/i);
});

test('the welcome message no longer promises age estimation or manufacture-date decoding', () => {
  assert.doesNotMatch(html, /Decoding serial numbers &amp; finding manufacture dates/);
  assert.doesNotMatch(html, /Estimating appliance age from model numbers or descriptions/);
  assert.match(html, /Serial Number Decoder or Smart Lookup/);
});

test('the H1 and subheading no longer frame the Assistant as an age-decoding tool', () => {
  assert.doesNotMatch(html, /<h1>Ask Anything About Your Appliance or Device<\/h1>/);
  assert.doesNotMatch(html, /appliance age, replacement guidance, serial decoding help/);
});

test('existing chat send/error/loading behavior is unchanged', () => {
  assert.match(html, /function sendMessage\(\)/);
  assert.match(html, /fetch\('\/api\/assistant-chat', \{/);
  assert.match(html, /Sorry, something went wrong: \$\{err\.error \|\| res\.status\}\. Please try again\./);
  assert.match(html, /Connection error\. Please check your connection and try again\./);
  assert.match(html, /Thinking\.\.\./);
  assert.match(html, /setStatus\('Ready'\)/);
});

test('the system prompt no longer lists independent age/serial estimation as a responsibility', () => {
  assert.doesNotMatch(apiSource, /Estimate appliance age or production era from a brand, model number, serial number/);
  assert.doesNotMatch(apiSource, /If the user gives a serial or model number, analyze it first before giving general advice/);
});

test('the system prompt explicitly redirects age/date determination to the Decoder or Smart Lookup', () => {
  assert.match(apiSource, /Serial Number Decoder or Smart Lookup/);
  assert.match(apiSource, /Do not independently claim or estimate a specific manufacture year/i);
});

test('the system prompt still supports label location and repair-vs-replace guidance', () => {
  assert.match(apiSource, /serial and model number tags are usually located/);
  assert.match(apiSource, /repair-versus-replace guidance/);
});
