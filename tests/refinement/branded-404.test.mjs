import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../404.html', import.meta.url), 'utf8');
const recoveryRoutes = ['/', '/decoder-tool', '/smart-lookup', '/brands', '/serial-number-location-guide'];

test('branded 404 provides direct canonical recovery links', () => {
  assert.match(html, /We couldn’t find that page\./);
  assert.match(html, /Decode My <span>Item<\/span>/);
  for (const route of recoveryRoutes) assert.match(html, new RegExp(`href="${route === '/' ? '\\/' : route}"`));
  assert.doesNotMatch(html, /localhost|vercel\.app|href=""|href="#"|serial-number-lookup"/i);
});

test('branded 404 has visible keyboard focus styling and mobile-safe recovery layout', () => {
  assert.match(html, /:focus-visible/);
  assert.match(html, /@media \(max-width:480px\).*grid-template-columns:1fr/s);
});
