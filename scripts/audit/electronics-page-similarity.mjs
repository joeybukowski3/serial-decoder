#!/usr/bin/env node
/**
 * Measure visible-text similarity across the approval-facing electronics pages.
 *
 * This audit intentionally ignores scripts, styles, navigation, and footer markup
 * so shared product-shell code does not hide repetitive editorial content.
 * Use --enforce to fail when any pair remains near-identical.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const FILES = [
  'apple.html',
  'hp.html',
  'sony.html',
  'bosch.html',
  'google-pixel.html',
  'panasonic.html',
  'vizio.html',
  'samsung-tv-serial-number-decoder.html'
];
const ENFORCE = process.argv.includes('--enforce');
const MAX_PAIR_SIMILARITY = 0.72;

function editorialText(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:[a-z]+|#\d+|#x[a-f\d]+);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokens(text) {
  return text.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
}

function shingles(words, width = 5) {
  const result = new Set();
  for (let i = 0; i <= words.length - width; i += 1) {
    result.add(words.slice(i, i + width).join(' '));
  }
  return result;
}

function jaccard(left, right) {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection || 1);
}

const pages = FILES.map((file) => {
  const words = tokens(editorialText(readFileSync(resolve(ROOT, file), 'utf8')));
  return { file, words, shingles: shingles(words), vocabulary: new Set(words) };
});

const vocabularyOwners = new Map();
for (const page of pages) {
  for (const word of page.vocabulary) {
    const owners = vocabularyOwners.get(word) || new Set();
    owners.add(page.file);
    vocabularyOwners.set(word, owners);
  }
}

const pairs = [];
for (let i = 0; i < pages.length; i += 1) {
  for (let j = i + 1; j < pages.length; j += 1) {
    pairs.push({
      left: pages[i].file,
      right: pages[j].file,
      similarity: jaccard(pages[i].shingles, pages[j].shingles)
    });
  }
}

pairs.sort((a, b) => b.similarity - a.similarity);
const meanSimilarity = pairs.reduce((sum, pair) => sum + pair.similarity, 0) / pairs.length;
const allShared = new Set(pages[0].shingles);
for (const page of pages.slice(1)) {
  for (const shingle of allShared) if (!page.shingles.has(shingle)) allShared.delete(shingle);
}
const averageShingleCount = pages.reduce((sum, page) => sum + page.shingles.size, 0) / pages.length;
const sharedTemplateRatio = allShared.size / (averageShingleCount || 1);

console.log('=== ELECTRONICS PAGE SIMILARITY ===');
console.log(`pages: ${pages.length}`);
console.log(`mean pair similarity: ${(meanSimilarity * 100).toFixed(1)}%`);
console.log(`highest pair similarity: ${(pairs[0].similarity * 100).toFixed(1)}% (${pairs[0].left} / ${pairs[0].right})`);
console.log(`cluster-wide shared 5-gram ratio: ${(sharedTemplateRatio * 100).toFixed(1)}%`);
console.log('');
for (const page of pages) {
  const uniqueWords = [...page.vocabulary].filter((word) => vocabularyOwners.get(word).size === 1).length;
  console.log(`${page.file}: words=${page.words.length}, uniqueWords=${uniqueWords}, shingles=${page.shingles.size}`);
}
console.log('');
console.log('Most similar pairs:');
for (const pair of pairs.slice(0, 8)) {
  console.log(`  ${(pair.similarity * 100).toFixed(1)}%  ${pair.left} / ${pair.right}`);
}

if (ENFORCE && pairs.some((pair) => pair.similarity > MAX_PAIR_SIMILARITY)) {
  console.error(`Similarity regression: a page pair exceeds ${(MAX_PAIR_SIMILARITY * 100).toFixed(0)}%.`);
  process.exitCode = 1;
}
