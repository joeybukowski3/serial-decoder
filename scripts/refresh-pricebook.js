// scripts/refresh-pricebook.js
// Runs daily via GitHub Actions — checks all BB SKUs in pricebook.json,
// updates prices, flags failures, sends email summary via Resend.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRICEBOOK_PATH = path.join(__dirname, '..', 'data', 'pricebook.json');
const BB_API_KEY  = process.env.BESTBUY_API_KEY;
const RESEND_KEY  = process.env.RESEND_API_KEY;
const ALERT_EMAIL = 'joeybuk03@gmail.com';
const FROM_EMAIL  = 'pricebook@decodemyitem.com';

async function fetchBBPrice(sku) {
  const url = `https://api.bestbuy.com/v1/products/${sku}.json?apiKey=${BB_API_KEY}&show=sku,name,salePrice,onlineAvailability`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (res.status === 200) {
      const data = await res.json();
      return {
        price:     data.salePrice,
        available: data.onlineAvailability !== false,
        name:      data.name,
        status:    'ok',
      };
    }
    return { status: `http_${res.status}` };
  } catch (e) {
    return { status: `error_${e.message?.slice(0, 30)}` };
  }
}

async function sendEmail(subject, htmlBody) {
  if (!RESEND_KEY) { console.log('No RESEND_API_KEY — skipping email'); return; }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: ALERT_EMAIL, subject, html: htmlBody }),
  });
  if (!res.ok) console.error('Resend error:', await res.text());
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const pricebook = JSON.parse(fs.readFileSync(PRICEBOOK_PATH, 'utf8'));
  const today = new Date().toISOString().split('T')[0];

  const results = { updated: [], failed: [], oos: [], no_sku: [] };
  let totalChecked = 0;

  for (const [category, entries] of Object.entries(pricebook)) {
    for (const entry of entries) {
      if (!entry.bb_sku) {
        results.no_sku.push({ category, tier: entry.brand_tier, style: entry.style });
        continue;
      }

      await sleep(300);
      const result = await fetchBBPrice(entry.bb_sku);
      totalChecked++;

      if (result.status === 'ok') {
        const oldPrice = entry.bb_price;
        entry.bb_price = result.price;
        entry.bb_description = result.name || entry.bb_description;
        entry.last_refreshed = today;

        if (!result.available) {
          entry.bb_price = null;
          results.oos.push({
            category, tier: entry.brand_tier, style: entry.style,
            sku: entry.bb_sku, name: result.name,
          });
        } else if (oldPrice !== result.price) {
          results.updated.push({
            category, tier: entry.brand_tier, style: entry.style,
            sku: entry.bb_sku, old_price: oldPrice, new_price: result.price,
          });
        }
      } else {
        // Failed — clear BB data so site shows omitted
        results.failed.push({
          category, tier: entry.brand_tier, style: entry.style,
          sku: entry.bb_sku, reason: result.status,
        });
        entry.bb_price = null;
        entry.last_refreshed = today;
      }
    }
  }

  // Save updated pricebook
  fs.writeFileSync(PRICEBOOK_PATH, JSON.stringify(pricebook, null, 2));
  console.log(`✅ Refreshed ${totalChecked} SKUs`);
  console.log(`Updated: ${results.updated.length} | OOS: ${results.oos.length} | Failed: ${results.failed.length} | No SKU: ${results.no_sku.length}`);

  // Build email
  const hasAlerts = results.failed.length > 0 || results.oos.length > 0;
  const subject = hasAlerts
    ? `⚠️ Pricebook Refresh ${today} — ${results.failed.length} failed, ${results.oos.length} OOS`
    : `✅ Pricebook Refresh ${today} — All clear`;

  const rows = (items, color, label) => items.length === 0 ? '' : `
    <h3 style="color:${color}">${label} (${items.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr style="background:#f0f0f0">
        <th style="padding:6px;text-align:left">Category</th>
        <th style="padding:6px;text-align:left">Tier</th>
        <th style="padding:6px;text-align:left">Style</th>
        <th style="padding:6px;text-align:left">SKU</th>
        <th style="padding:6px;text-align:left">Detail</th>
      </tr>
      ${items.map(i => `
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:6px">${i.category}</td>
          <td style="padding:6px">${i.tier}</td>
          <td style="padding:6px">${i.style || '—'}</td>
          <td style="padding:6px">${i.sku || '—'}</td>
          <td style="padding:6px">${i.reason || i.name || (i.old_price ? `$${i.old_price} → $${i.new_price}` : '—')}</td>
        </tr>`).join('')}
    </table>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:auto">
      <h2 style="color:#1F3864">Pricebook Daily Refresh — ${today}</h2>
      <p>Checked <strong>${totalChecked}</strong> BB SKUs across 7 categories.</p>
      <table style="margin-bottom:16px">
        <tr><td style="padding:4px 12px 4px 0">✅ Prices updated:</td><td><strong>${results.updated.length}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0">⚠️ Out of stock:</td><td><strong>${results.oos.length}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0">❌ Failed / not found:</td><td><strong>${results.failed.length}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0">— No SKU:</td><td><strong>${results.no_sku.length}</strong></td></tr>
      </table>
      ${rows(results.failed, '#c62828', '❌ Failed — needs manual SKU update')}
      ${rows(results.oos,    '#e65100', '⚠️ Out of Stock')}
      ${rows(results.updated,'#2e7d32', '✅ Price Changes')}
      <p style="color:#999;font-size:11px;margin-top:24px">Sent by decodemyitem.com pricebook refresh · ${today}</p>
    </div>`;

  await sendEmail(subject, html);
}

main().catch(e => { console.error(e); process.exit(1); });
