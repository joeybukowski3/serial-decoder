import { readFile, writeFile } from 'node:fs/promises';
import { minify } from 'terser';

async function writeIfChanged(url, content) {
  let previous = null;
  try {
    previous = await readFile(url, 'utf8');
  } catch (_) {}
  if ((previous || '').replace(/\r\n/g, '\n') !== content) await writeFile(url, content, 'utf8');
}

const sourcePath = new URL('../src/browser/serial-refinement-controller.js', import.meta.url);
const outputPath = new URL('../serial-refinement-controller.js', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const result = await minify(source, {
  compress: true,
  mangle: true,
  format: { comments: false },
});
if (!result.code) throw new Error('Terser did not produce the serial refinement browser bundle.');
await writeIfChanged(outputPath, `${result.code}\n`);
console.log(`Built ${outputPath.pathname}`);
