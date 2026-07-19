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

function isManagedBundle(file) {
  return /^(appliances|hvac|water-heaters|electronics)(?:\.[a-f0-9]{10})?\.js$/i.test(file);
}

function validateArtifacts(artifacts) {
  const expectedKeys = categories.map((category) => category.key).sort();
  const manifestKeys = Object.keys(artifacts.manifest).sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(manifestKeys)) {
    throw new Error('Decoder bundle manifest does not contain every expected category');
  }

  const filesByName = new Set(artifacts.files.map((file) => file.file));
  for (const category of categories) {
    const publicPath = artifacts.manifest[category.key];
    const file = publicPath && publicPath.replace(/^\/assets\/decoders\//, '');
    if (!file || !filesByName.has(file)) {
      throw new Error(`Manifest entry for ${category.key} does not point to a generated file`);
    }
  }

  artifacts.files.forEach((file) => {
    if (!file.contents || !file.contents.length) {
      throw new Error(`Generated bundle ${file.file} is empty`);
    }
  });
}

function createBundleArtifacts(source) {
  const manifest = {};
  const files = categories.map((category) => {
    const contents = buildBundle(source, category);
    const hash = crypto.createHash('sha256').update(contents).digest('hex').slice(0, 10);
    const file = `${category.slug}.${hash}.js`;
    manifest[category.key] = `/assets/decoders/${file}`;
    return { category: category.key, file, contents };
  });

  const artifacts = { manifest, files };
  validateArtifacts(artifacts);
  return artifacts;
}

function assertWrittenArtifacts(artifacts, dir) {
  artifacts.files.forEach((file) => {
    const target = path.join(dir, file.file);
    if (!fs.existsSync(target) || fs.statSync(target).size <= 0) {
      throw new Error(`Generated bundle ${file.file} was not written`);
    }
  });

  const manifestPath = path.join(dir, 'decoder-bundles.json');
  if (!fs.existsSync(manifestPath) || fs.statSync(manifestPath).size <= 0) {
    throw new Error('Generated decoder bundle manifest was not written');
  }
}

function publishArtifacts(artifacts, options = {}) {
  const targetDir = options.outputDir || outputDir;
  fs.mkdirSync(targetDir, { recursive: true });

  const tempDir = fs.mkdtempSync(path.join(targetDir, '.decoder-build-'));
  try {
    artifacts.files.forEach((file) => {
      fs.writeFileSync(path.join(tempDir, file.file), file.contents, 'utf8');
    });
    fs.writeFileSync(
      path.join(tempDir, 'decoder-bundles.json'),
      `${JSON.stringify(artifacts.manifest, null, 2)}\n`,
      'utf8'
    );
    assertWrittenArtifacts(artifacts, tempDir);

    if (options.simulateFailureAt === 'after-temp') {
      throw new Error('Simulated decoder bundle generation failure after temporary files');
    }

    artifacts.files.forEach((file) => {
      fs.copyFileSync(path.join(tempDir, file.file), path.join(targetDir, file.file));
    });

    if (options.simulateFailureAt === 'after-bundles') {
      throw new Error('Simulated decoder bundle generation failure after bundle publication');
    }

    fs.renameSync(path.join(tempDir, 'decoder-bundles.json'), path.join(targetDir, 'decoder-bundles.json'));
    assertWrittenArtifacts(artifacts, targetDir);

    const keep = new Set(artifacts.files.map((file) => file.file));
    fs.readdirSync(targetDir).forEach((file) => {
      if (isManagedBundle(file) && !keep.has(file)) {
        fs.unlinkSync(path.join(targetDir, file));
      }
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function buildDecoderBundles(options = {}) {
  const activeSourcePath = options.sourcePath || sourcePath;
  const activeOutputDir = options.outputDir || outputDir;
  const source = fs.readFileSync(activeSourcePath, 'utf8');
  const artifacts = createBundleArtifacts(source);
  publishArtifacts(artifacts, {
    outputDir: activeOutputDir,
    simulateFailureAt: options.simulateFailureAt
  });
  return artifacts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const artifacts = buildDecoderBundles();
  console.log(`Wrote ${artifacts.files.length} hashed decoder bundles to ${path.relative(root, outputDir)}`);
}
