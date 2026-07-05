import { readFile, writeFile } from 'node:fs/promises';
import { minify } from 'terser';

async function writeIfChanged(url, content) {
  let previous = null;
  try {
    previous = await readFile(url, 'utf8');
  } catch (_) {}
  if ((previous || '').replace(/\r\n/g, '\n') !== content) await writeFile(url, content, 'utf8');
}

async function minifySource(url) {
  const source = await readFile(url, 'utf8');
  const result = await minify(source, {
    compress: true,
    mangle: true,
    format: { comments: false },
  });
  if (!result.code) throw new Error(`Terser did not produce output for ${url.pathname}.`);
  return `${result.code}\n`;
}

const controllerSourcePath = new URL('../src/browser/serial-refinement-controller.js', import.meta.url);
const patchSourcePath = new URL('../src/browser/serial-refinement-single-candidate-patch.js', import.meta.url);
const controllerCoreOutputPath = new URL('../serial-refinement-controller-core.js', import.meta.url);
const patchOutputPath = new URL('../serial-refinement-single-candidate-patch.js', import.meta.url);
const loaderOutputPath = new URL('../serial-refinement-controller.js', import.meta.url);

const [controllerCode, patchCode] = await Promise.all([
  minifySource(controllerSourcePath),
  minifySource(patchSourcePath),
]);

const loaderCode = `!function(){"use strict";function e(e,n){var t=document.createElement("script");t.src=e,t.async=!1,n&&(t.onload=n),document.head.appendChild(t)}e("/serial-refinement-controller-core.js",function(){e("/serial-refinement-single-candidate-patch.js")})}();\n`;

await writeIfChanged(controllerCoreOutputPath, controllerCode);
await writeIfChanged(patchOutputPath, patchCode);
await writeIfChanged(loaderOutputPath, loaderCode);
console.log(`Built ${controllerCoreOutputPath.pathname}, ${patchOutputPath.pathname}, and ${loaderOutputPath.pathname}`);
