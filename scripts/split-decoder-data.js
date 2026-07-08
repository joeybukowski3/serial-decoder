import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'decoder-data.js');
const outputDir = path.join(root, 'assets', 'decoders');

const categories = [
  { key: 'appliances', slug: 'appliances' },
  { key: 'hvac', slug: 'hvac' },
  { key: 'waterHeaters', slug: 'water-heaters' },
  { key: 'electronics', slug: 'electronics' }
];

function findMatchingBrace(source, openIndex) {
  let state = 'code';
  let depth = 0;
  let escaped = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        state = 'code';
        i += 1;
      }
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (
        (state === 'single' && char === "'") ||
        (state === 'double' && char === '"') ||
        (state === 'template' && char === '`')
      ) {
        state = 'code';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      state = 'line-comment';
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      state = 'block-comment';
      i += 1;
      continue;
    }
    if (char === "'") {
      state = 'single';
      continue;
    }
    if (char === '"') {
      state = 'double';
      continue;
    }
    if (char === '`') {
      state = 'template';
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  throw new Error('Unable to find matching brace in decoder-data.js');
}

function extractCategoryObject(source, key) {
  const match = new RegExp(`(?:^|[,{])\\s*${key}:\\s*\\{`).exec(source);
  if (!match) throw new Error(`Missing category ${key} in decoder-data.js`);
  const openIndex = match.index + match[0].lastIndexOf('{');
  const closeIndex = findMatchingBrace(source, openIndex);
  return source.slice(openIndex, closeIndex + 1);
}

function buildBundle(source, category) {
  const dataMatch = /\bvar\s+decoderData\s*=\s*\{/.exec(source);
  if (!dataMatch) throw new Error('Missing decoderData object in decoder-data.js');
  const dataStart = dataMatch.index;

  const prelude = source.slice(0, dataStart).trim();
  const categoryObject = extractCategoryObject(source.slice(dataStart), category.key);

  return `${prelude}

(function(global) {
  var categoryData = ${categoryObject};
  global.decoderData = global.decoderData || {};
  global.decoderData.${category.key} = categoryData;
})(window);
`;
}

const source = fs.readFileSync(sourcePath, 'utf8');
fs.mkdirSync(outputDir, { recursive: true });

fs.readdirSync(outputDir).forEach((file) => {
  if (/^(appliances|hvac|water-heaters|electronics)(?:\.[a-f0-9]{10})?\.js$/i.test(file)) {
    fs.unlinkSync(path.join(outputDir, file));
  }
});

const manifest = {};

categories.forEach((category) => {
  const bundle = buildBundle(source, category);
  const hash = crypto.createHash('sha256').update(bundle).digest('hex').slice(0, 10);
  const file = `${category.slug}.${hash}.js`;
  manifest[category.key] = `/assets/decoders/${file}`;
  fs.writeFileSync(
    path.join(outputDir, file),
    bundle,
    'utf8'
  );
});

fs.writeFileSync(
  path.join(outputDir, 'decoder-bundles.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

console.log(`Wrote ${categories.length} hashed decoder bundles to ${path.relative(root, outputDir)}`);
