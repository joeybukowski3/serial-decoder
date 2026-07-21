import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const files = await readdir(root);
const analyticsTag = '<script defer src="/lookup-completion-analytics.js"></script>';
const refinementTag = '<script defer src="/serial-refinement-controller.js"></script>';
let analyticsUpdated = 0;
let refinementUpdated = 0;

for (const filename of files) {
  if (!filename.endsWith('.html')) continue;
  const filePath = path.join(root, filename);
  let html = await readFile(filePath, 'utf8');
  const hasDecodeButton = /id=["']decodeBtn["']/.test(html);
  const hasSerialInput = /id=["']serial["']/.test(html);
  const hasSmartLookup = /id=["']smart-lookup-input["']/.test(html);
  if ((!hasDecodeButton || !hasSerialInput) && !hasSmartLookup) continue;

  if (!html.includes('/lookup-completion-analytics.js')) {
    if (/<script[^>]+src=["'][^"']*script\.js[^"']*["'][^>]*><\/script>/i.test(html)) {
      html = html.replace(/(<script[^>]+src=["'][^"']*script\.js[^"']*["'][^>]*><\/script>)/i, `$1\n  ${analyticsTag}`);
      analyticsUpdated += 1;
    } else if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `  ${analyticsTag}\n</body>`);
      analyticsUpdated += 1;
    }
  }

  if (hasDecodeButton && hasSerialInput && !html.includes('/serial-refinement-controller.js')) {
    if (/<script[^>]+src=["'][^"']*lookup-completion-analytics\.js[^"']*["'][^>]*><\/script>/i.test(html)) {
      html = html.replace(/(<script[^>]+src=["'][^"']*lookup-completion-analytics\.js[^"']*["'][^>]*><\/script>)/i, `$1\n  ${refinementTag}`);
    } else if (/<script[^>]+src=["'][^"']*script\.js[^"']*["'][^>]*><\/script>/i.test(html)) {
      html = html.replace(/(<script[^>]+src=["'][^"']*script\.js[^"']*["'][^>]*><\/script>)/i, `$1\n  ${refinementTag}`);
    } else if (/<\/body>/i.test(html)) {
      html = html.replace(/<\/body>/i, `  ${refinementTag}\n</body>`);
    } else {
      continue;
    }
    refinementUpdated += 1;
  }

  await writeFile(filePath, html, 'utf8');
}

console.log(`Ensured lookup completion analytics on ${analyticsUpdated} HTML files.`);
console.log(`Ensured serial refinement controller on ${refinementUpdated} decoder HTML files.`);
