#!/usr/bin/env node

/**
 * Add Large Loss Decoder link to navigation and footer
 * Updates all HTML files with nav element
 */

import fs from 'fs';
import path from 'path';

// Navigation item to add
const navItem = '<li><a href="/large-loss-decoder">Large Loss Decoder</a></li>';
const footerItem = '<li><a href="/large-loss-decoder">Large Loss Decoder</a></li>';

// Get all HTML files
const htmlFiles = fs.readdirSync('.').filter(f => f.endsWith('.html'));

let updated = 0;
let errors = [];

htmlFiles.forEach(file => {
  try {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;

    // Add to navigation (after Smart Lookup, before AI Assistant)
    const navRegex = /(<li><a href="\/smart-lookup">Smart Lookup<\/a><\/li>)\n\s*(<li><a href="\/assistant">AI Assistant<\/a><\/li>)/;
    if (navRegex.test(content) && !content.includes('href="/large-loss-decoder"')) {
      content = content.replace(navRegex, `$1\n  ${navItem}\n  $2`);
      modified = true;
    }

    // Add to footer Tools section (after Smart Lookup)
    const footerRegex = /(<li><a href="\/smart-lookup">Smart Lookup<\/a><\/li>)\n\s*(<li><a href="\/assistant">AI Assistant<\/a><\/li>)/;
    if (footerRegex.test(content) && content.includes('footer') && !content.includes('href="/large-loss-decoder"')) {
      content = content.replace(footerRegex, `$1\n        ${footerItem}\n        $2`);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(file, content, 'utf8');
      updated++;
      console.log(`✓ ${file}`);
    }
  } catch (err) {
    errors.push({ file, error: err.message });
    console.error(`✗ ${file}: ${err.message}`);
  }
});

console.log(`\nUpdated ${updated}/${htmlFiles.length} files`);
if (errors.length > 0) {
  console.log(`Errors: ${errors.length}`);
  errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
}
