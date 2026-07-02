import { readFile, writeFile } from 'node:fs/promises';
import { minify } from 'terser';

const sourcePath = new URL('../src/browser/serial-refinement-controller.js', import.meta.url);
const outputPath = new URL('../serial-refinement-controller.js', import.meta.url);
const source = await readFile(sourcePath, 'utf8');
const result = await minify(source, {
  compress: true,
  mangle: true,
  format: { comments: false },
});
if (!result.code) throw new Error('Terser did not produce the serial refinement browser bundle.');
await writeFile(outputPath, `${result.code}\n`, 'utf8');
console.log(`Built ${outputPath.pathname}`);
