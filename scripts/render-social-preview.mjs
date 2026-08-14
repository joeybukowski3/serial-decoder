/**
 * Renders assets/decodemyitem-social-preview.png (1200×630)
 * from the existing DecodeMyItem logo + brand copy.
 *
 * Uses Playwright (already a devDependency). No production deps added.
 * Re-run: node scripts/render-social-preview.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createAnalyticsBlockingContext } from '../tests/helpers/analytics-blocking.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const logoPath = path.join(root, 'assets', 'decodemyitem-logo.png');
const outPath = path.join(root, 'assets', 'decodemyitem-social-preview.png');
const previewDir = path.join(root, 'artifacts', 'social-preview');

const WIDTH = 1200;
const HEIGHT = 630;

const logoB64 = fs.readFileSync(logoPath).toString('base64');
const logoDataUrl = `data:image/png;base64,${logoB64}`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      overflow: hidden;
      background: #0b1326;
    }
    #frame {
      width: ${WIDTH}px;
      height: ${HEIGHT}px;
      position: relative;
      background: linear-gradient(145deg, #0b1326 0%, #0f1a30 55%, #0b1326 100%);
      font-family: Sora, "Segoe UI", system-ui, sans-serif;
      color: #dae2fd;
      overflow: hidden;
    }
    .accent-bar {
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 8px;
      background: linear-gradient(180deg, #44e5c2 0%, #0099ff 100%);
    }
    .outer-ring {
      position: absolute;
      left: 48px; top: 48px;
      width: 1104px; height: 534px;
      border: 1.5px solid rgba(68, 229, 194, 0.16);
      border-radius: 20px;
      pointer-events: none;
    }
    .orb {
      position: absolute;
      right: 70px; top: 70px;
      width: 180px; height: 180px;
      border-radius: 50%;
      border: 1px solid rgba(68, 229, 194, 0.08);
      pointer-events: none;
    }
    .orb::after {
      content: "";
      position: absolute;
      inset: 36px;
      border-radius: 50%;
      border: 1px solid rgba(68, 229, 194, 0.10);
    }
    .layout {
      position: absolute;
      left: 96px;
      right: 96px;
      top: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      gap: 56px;
    }
    .logo-panel {
      flex: 0 0 auto;
      width: 300px;
      height: 300px;
      border-radius: 28px;
      /* Match logo plate (#E5E5E5) so the mark is used exactly as-is */
      background: #e5e5e5;
      border: 1px solid rgba(68, 229, 194, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
      overflow: hidden;
    }
    .logo-panel img {
      display: block;
      width: 248px;
      height: 248px;
      object-fit: contain;
    }
    .copy {
      flex: 1 1 auto;
      min-width: 0;
      padding-right: 12px;
    }
    .brand {
      font-size: 58px;
      font-weight: 800;
      letter-spacing: -1.5px;
      line-height: 1.05;
      color: #ffffff;
      margin-bottom: 18px;
    }
    .brand span { color: #44e5c2; }
    .tagline {
      font-size: 30px;
      font-weight: 600;
      line-height: 1.25;
      color: #44e5c2;
      margin-bottom: 22px;
      max-width: 620px;
    }
    .rule {
      width: 96px;
      height: 4px;
      border-radius: 2px;
      background: #44e5c2;
      margin-bottom: 22px;
    }
    .cats {
      font-size: 22px;
      font-weight: 500;
      line-height: 1.35;
      color: #bacac3;
      letter-spacing: 0.01em;
    }
  </style>
</head>
<body>
  <div id="frame">
    <div class="accent-bar" aria-hidden="true"></div>
    <div class="outer-ring" aria-hidden="true"></div>
    <div class="orb" aria-hidden="true"></div>
    <div class="layout">
      <div class="logo-panel">
        <img id="logoImg" alt="Decode My Item logo" width="248" height="248" />
      </div>
      <div class="copy">
        <div class="brand">Decode My <span>Item</span></div>
        <div class="tagline">Serial Number Decoder &amp; Age Lookup</div>
        <div class="rule" aria-hidden="true"></div>
        <div class="cats">Appliances · HVAC · Electronics · Water Heaters</div>
      </div>
    </div>
  </div>
  <script>
    const LOGO_SRC = ${JSON.stringify(logoDataUrl)};
    const img = document.getElementById('logoImg');
    img.onload = () => { document.body.dataset.ready = '1'; };
    img.onerror = () => { document.body.dataset.ready = 'error'; };
    img.src = LOGO_SRC;
  </script>
</body>
</html>`;

fs.mkdirSync(previewDir, { recursive: true });

const browser = await chromium.launch();
const context = await createAnalyticsBlockingContext(browser, {
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.body.dataset.ready === '1' || document.body.dataset.ready === 'error', null, {
  timeout: 30000,
});
const ready = await page.evaluate(() => document.body.dataset.ready);
if (ready !== '1') {
  await browser.close();
  throw new Error('Logo failed to load while rendering social preview');
}

// Ensure web font is applied
await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
});
await page.waitForTimeout(150);

const pngBuffer = await page.locator('#frame').screenshot({ type: 'png' });
await browser.close();

fs.writeFileSync(outPath, pngBuffer);

// Also write full-size + small preview copies for visual QA
fs.writeFileSync(path.join(previewDir, 'full-1200x630.png'), pngBuffer);

// Small link-preview simulation (~480×252)
{
  const b = await chromium.launch();
  const context = await createAnalyticsBlockingContext(b, { viewport: { width: 480, height: 252 }, deviceScaleFactor: 1 });
  const p = await context.newPage();
  const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;
  await p.setContent(`<!DOCTYPE html><html><body style="margin:0;background:#111">
    <img src="${dataUrl}" width="480" height="252" style="display:block;object-fit:cover" />
  </body></html>`);
  await p.waitForTimeout(50);
  const small = await p.screenshot({ type: 'png' });
  fs.writeFileSync(path.join(previewDir, 'preview-480x252.png'), small);
  await b.close();
}

const dims = {
  width: pngBuffer.readUInt32BE(16),
  height: pngBuffer.readUInt32BE(20),
  bytes: pngBuffer.length,
};

console.log(JSON.stringify({
  outPath: path.relative(root, outPath).replace(/\\/g, '/'),
  ...dims,
  fullPreview: path.relative(root, path.join(previewDir, 'full-1200x630.png')).replace(/\\/g, '/'),
  smallPreview: path.relative(root, path.join(previewDir, 'preview-480x252.png')).replace(/\\/g, '/'),
}, null, 2));
