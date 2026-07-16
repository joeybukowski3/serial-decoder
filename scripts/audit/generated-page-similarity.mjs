#!/usr/bin/env node
/**
 * Measure editorial similarity across generator-controlled page clusters.
 *
 * Shared scripts, styles, navigation, and footer markup are excluded so the
 * report focuses on the visible page-specific content. Run without --enforce
 * to capture a baseline; use --enforce in regression coverage.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CLUSTERS = {
  'remaining-generated': [
    'refrigerator-serial-number.html',
    'washer-serial-number.html',
    'dryer-serial-number.html',
    'dishwasher-serial-number.html',
    'range-oven-serial-number.html',
    'whirlpool-serial-number-lookup.html',
    'lg-serial-number-lookup.html',
    'frigidaire-serial-number-lookup.html',
    'maytag-serial-number-lookup.html',
    'kenmore-serial-number-lookup.html',
    'trane-serial-number-lookup.html',
    'rheem-serial-number-lookup.html',
    'asus-serial-number-decoder.html'
  ],
  electronics: [
    'apple.html',
    'hp.html',
    'sony.html',
    'bosch.html',
    'google-pixel.html',
    'panasonic.html',
    'vizio.html',
    'samsung-tv-serial-number-decoder.html'
  ]
};

const clusterArg = process.argv.find((arg) => arg.startsWith('--cluster='));
const clusterName = clusterArg ? clusterArg.slice('--cluster='.length) : 'remaining-generated';
const files = CLUSTERS[clusterName];
const enforce = process.argv.includes('--enforce');
const json = process.argv.includes('--json');
const maxPairSimilarity = clusterName === 'remaining-generated' ? 0.35 : 0.72;
const maxSharedTemplateRatio = clusterName === 'remaining-generated' ? 0.28 : 1;
const minUniqueWords = clusterName === 'remaining-generated' ? 20 : 0;

if (!files) {
  console.error(`Unknown cluster: ${clusterName}. Available clusters: ${Object.keys(CLUSTERS).join(', ')}`);
  process.exit(1);
}

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
  for (let index = 0; index <= words.length - width; index += 1) {
    result.add(words.slice(index, index + width).join(' '));
  }
  return result;
}

function jaccard(left, right) {
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / (left.size + right.size - intersection || 1);
}

function matchText(html, pattern) {
  return (html.match(pattern)?.[1] || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sitemap = readFileSync(resolve(ROOT, 'sitemap.xml'), 'utf8');
const pages = files.map((file) => {
  const html = readFileSync(resolve(ROOT, file), 'utf8');
  const words = tokens(editorialText(html));
  const route = `/${file.replace(/\.html$/, '')}`;
  return {
    file,
    route,
    title: matchText(html, /<title>([\s\S]*?)<\/title>/i),
    h1: matchText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
    robots: matchText(html, /<meta\s+name="robots"\s+content="([^"]+)"/i),
    canonical: matchText(html, /<link\s+rel="canonical"\s+href="([^"]+)"/i),
    sitemap: sitemap.includes(`<loc>https://www.decodemyitem.com${route}</loc>`),
    faqCount: (html.match(/class="bp-faq-item"/g) || []).length,
    exampleCount: (html.match(/class="ex-terminal"/g) || []).length,
    internalLinkCount: (html.match(/href="\/(?!\/)/g) || []).length,
    words,
    shingles: shingles(words),
    vocabulary: new Set(words)
  };
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
for (let leftIndex = 0; leftIndex < pages.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < pages.length; rightIndex += 1) {
    pairs.push({
      left: pages[leftIndex].file,
      right: pages[rightIndex].file,
      similarity: jaccard(pages[leftIndex].shingles, pages[rightIndex].shingles)
    });
  }
}

pairs.sort((left, right) => right.similarity - left.similarity);
const meanSimilarity = pairs.reduce((sum, pair) => sum + pair.similarity, 0) / pairs.length;
const allShared = new Set(pages[0].shingles);
for (const page of pages.slice(1)) {
  for (const shingle of allShared) if (!page.shingles.has(shingle)) allShared.delete(shingle);
}
const averageShingleCount = pages.reduce((sum, page) => sum + page.shingles.size, 0) / pages.length;
const sharedTemplateRatio = allShared.size / (averageShingleCount || 1);

const report = {
  cluster: clusterName,
  pages: pages.map((page) => ({
    file: page.file,
    route: page.route,
    title: page.title,
    h1: page.h1,
    robots: page.robots,
    canonical: page.canonical,
    sitemap: page.sitemap,
    faqCount: page.faqCount,
    exampleCount: page.exampleCount,
    internalLinkCount: page.internalLinkCount,
    words: page.words.length,
    uniqueWords: [...page.vocabulary].filter((word) => vocabularyOwners.get(word).size === 1).length,
    shingles: page.shingles.size
  })),
  meanPairSimilarity: meanSimilarity,
  highestPair: pairs[0],
  sharedTemplateRatio,
  closestPairs: pairs.slice(0, 10)
};

if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`=== GENERATED PAGE SIMILARITY: ${clusterName} ===`);
  console.log(`pages: ${pages.length}`);
  console.log(`mean pair similarity: ${(meanSimilarity * 100).toFixed(1)}%`);
  console.log(`highest pair similarity: ${(pairs[0].similarity * 100).toFixed(1)}% (${pairs[0].left} / ${pairs[0].right})`);
  console.log(`cluster-wide shared 5-gram ratio: ${(sharedTemplateRatio * 100).toFixed(1)}%`);
  console.log('');
  for (const page of report.pages) {
    console.log(`${page.file}: words=${page.words}, uniqueWords=${page.uniqueWords}, faqs=${page.faqCount}, examples=${page.exampleCount}, sitemap=${page.sitemap}`);
  }
  console.log('');
  console.log('Most similar pairs:');
  for (const pair of report.closestPairs) {
    console.log(`  ${(pair.similarity * 100).toFixed(1)}%  ${pair.left} / ${pair.right}`);
  }
}

if (enforce && pairs.some((pair) => pair.similarity > maxPairSimilarity)) {
  console.error(`Similarity regression: a page pair exceeds ${(maxPairSimilarity * 100).toFixed(0)}%.`);
  process.exitCode = 1;
}

if (enforce && sharedTemplateRatio > maxSharedTemplateRatio) {
  console.error(`Similarity regression: cluster-wide shared 5-grams exceed ${(maxSharedTemplateRatio * 100).toFixed(0)}%.`);
  process.exitCode = 1;
}

if (enforce && report.pages.some((page) => page.uniqueWords < minUniqueWords)) {
  console.error(`Similarity regression: a page has fewer than ${minUniqueWords} cluster-unique words.`);
  process.exitCode = 1;
}
