import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = await readdir(root);
let updated = 0;

for (const filename of files) {
  if (!filename.endsWith('.html')) continue;
  const filePath = path.join(root, filename);
  let html = await readFile(filePath, 'utf8');
  if (!/href=["'](?:\/)?shared\.css["']/.test(html) || !/id=["']hamburgerBtn["']/.test(html)) continue;

  let next = html;
  if (!/href=["'](?:\/)?responsive-navigation\.css["']/.test(next)) {
    next = next.replace(/(<link\s+rel=["']stylesheet["']\s+href=["'](?:\/)?shared\.css["']>)/i, '$1\n  <link rel="stylesheet" href="responsive-navigation.css">');
  }
  if (!/src=["'](?:\/)?responsive-navigation\.js["']/.test(next)) {
    next = next.replace(/<\/body>/i, '  <script defer src="responsive-navigation.js"></script>\n</body>');
  }
  if (next !== html) {
    await writeFile(filePath, next, 'utf8');
    updated += 1;
  }
}

console.log(`Ensured responsive navigation assets on ${updated} HTML files.`);
