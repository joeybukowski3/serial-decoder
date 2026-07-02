import { readFile, writeFile } from 'node:fs/promises';
import { minify } from 'terser';

async function writeIfChanged(url, content) {
  let previous = null;
  try {
    previous = await readFile(url, 'utf8');
  } catch (_) {}
  if (previous !== content) await writeFile(url, content, 'utf8');
}

const sourcePath = new URL('../src/browser/smart-lookup-controller.js', import.meta.url);
const outputPath = new URL('../smart-lookup-controller.js', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const result = await minify(source, {
  compress: true,
  mangle: true,
  format: { comments: false },
});
if (!result.code) throw new Error('Terser did not produce the Smart Lookup browser bundle.');
await writeIfChanged(outputPath, `${result.code}\n`);
console.log(`Built ${outputPath.pathname}`);
