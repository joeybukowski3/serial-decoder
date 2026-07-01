import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = await readdir(root);
const tag = '<script defer src="/serial-refinement-controller.js"></script>';
let updated = 0;

for (const filename of files) {
  if (!filename.endsWith('.html')) continue;
  const filePath = path.join(root, filename);
  let html = await readFile(filePath, 'utf8');
  if (!/id=["'](?:decodeBtn|brand|serial)["']/.test(html) && !/script\.js/.test(html)) continue;
  if (html.includes('/serial-refinement-controller.js')) continue;

  if (/<script[^>]+src=["'][^"']*script\.js[^"']*["'][^>]*><\/script>/i.test(html)) {
    html = html.replace(/(<script[^>]+src=["'][^"']*script\.js[^"']*["'][^>]*><\/script>)/i, `$1\n  ${tag}`);
  } else if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, `  ${tag}\n</body>`);
  } else {
    continue;
  }
  await writeFile(filePath, html, 'utf8');
  updated += 1;
}

console.log(`Ensured serial refinement controller on ${updated} HTML files.`);
