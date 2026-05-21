/**
 * replace-nav.cjs
 * Updates all HTML pages to use the new nav with Resources dropdown.
 * Handles both <nav> (majority of pages) and <header class="header-main"> patterns.
 */
const fs = require('fs');
const path = require('path');

// The new <ul> content — inserted inside whichever nav wrapper exists
const NEW_NAV_UL = `<ul>
  <li><a href="/">Home</a></li>
  <li><a href="/decoder-tool">Serial Number Decoder</a></li>
  <li><a href="/smart-lookup">Smart Lookup</a></li>
  <li><a href="/large-loss-decoder">Large Loss Decoder</a></li>
  <li><a href="/assistant">AI Assistant</a></li>
  <li class="nav-dropdown-item">
    <button class="nav-dropdown-toggle" type="button" aria-expanded="false" aria-haspopup="true">
      Resources <span class="nav-chevron" aria-hidden="true">&#9662;</span>
    </button>
    <div class="nav-dropdown-panel" role="menu">
      <div class="nav-dropdown-col">
        <p class="nav-dropdown-label">Age Research</p>
        <a href="/how-old-is-my-appliance" role="menuitem">How Old Is My Appliance?</a>
        <a href="/how-old-is-my-hvac" role="menuitem">How Old Is My HVAC?</a>
        <a href="/how-old-is-my-plumbing" role="menuitem">How Old Is My Water Heater?</a>
        <a href="/how-old-is-my-electronics" role="menuitem">How Old Is My Electronics?</a>
      </div>
      <div class="nav-dropdown-col">
        <p class="nav-dropdown-label">Item History Guides</p>
        <a href="/item-history-guides" role="menuitem" class="nav-dropdown-featured">All History Guides &#8594;</a>
        <a href="/electrical-service-panel-history" role="menuitem">Electrical Panels</a>
        <a href="/electrical-wiring-history" role="menuitem">Electrical Wiring</a>
        <a href="/hvac-system-history" role="menuitem">HVAC Systems</a>
        <a href="/water-heater-history" role="menuitem">Water Heaters</a>
        <a href="/major-appliances-history" role="menuitem">Major Appliances</a>
        <a href="/tv-history" role="menuitem">TVs</a>
        <a href="/computer-history" role="menuitem">Computers</a>
      </div>
      <div class="nav-dropdown-col">
        <p class="nav-dropdown-label">Reference</p>
        <a href="/serial-number-location-guide" role="menuitem">Serial Number Locations</a>
        <a href="/appliance-age-for-insurance-and-replacement" role="menuitem">Appliance Age for Insurance</a>
        <a href="/how-to-read-serial-number" role="menuitem">How to Read a Serial Number</a>
        <a href="/methodology" role="menuitem">Methodology</a>
        <a href="/about" role="menuitem">About</a>
      </div>
    </div>
  </li>
  <li><a href="/contact">Contact</a></li>
  <li><a href="/security" class="nav-cta">Security &amp; Data</a></li>
</ul>`;

// The complete new <nav> block for pages using the plain-nav pattern
const NEW_PLAIN_NAV = `<nav>
  <a href="/" class="logo" aria-label="Decode My Item home">
    <span class="material-symbols-outlined" style="color:#44e5c2;font-size:26px;flex-shrink:0;line-height:1;">qr_code_scanner</span>
    <div>
      <div class="logo-text">Decode My <span>Item</span></div><div class="logo-sub">Decode - Research - Automate</div>
    </div>
  </a>
  <button class="hamburger" id="hamburgerBtn" aria-label="Open menu"><span></span><span></span><span></span></button>
  ${NEW_NAV_UL}
</nav>`;

// The new <header> + inner nav block for pages using header-main pattern
const NEW_HEADER_NAV_UL = `    <nav class="header-nav">
      ${NEW_NAV_UL}
    </nav>`;

// Regex patterns for detection
// Pattern 1: plain <nav> containing decoder-tool link
const PLAIN_NAV_RE = /<nav>[\s\S]*?<\/nav>/g;
// Pattern 2: <nav class="header-nav"> inside header-main
const HEADER_NAV_RE = /<nav class="header-nav">[\s\S]*?<\/nav>/g;

const rootDir = path.join(__dirname, '..');
const htmlFiles = fs.readdirSync(rootDir).filter(f => f.endsWith('.html'));

let updated = 0, skipped = 0;

for (const file of htmlFiles) {
  const fullPath = path.join(rootDir, file);
  let content = fs.readFileSync(fullPath, 'utf8');

  // Skip if already has the dropdown
  if (content.includes('nav-dropdown-item')) {
    skipped++;
    continue;
  }

  let changed = false;

  // Handle header-main pattern first (more specific)
  if (content.includes('class="header-main"')) {
    const replaced = content.replace(HEADER_NAV_RE, (match) => {
      if (match.includes('/decoder-tool') || match.includes('/smart-lookup') || match.includes('/item-history-guides')) {
        changed = true;
        return NEW_HEADER_NAV_UL;
      }
      return match;
    });
    if (changed) content = replaced;
  }

  // Handle plain <nav> pattern
  if (!changed) {
    const replaced = content.replace(PLAIN_NAV_RE, (match) => {
      if (match.includes('/decoder-tool') || match.includes('/smart-lookup')) {
        changed = true;
        return NEW_PLAIN_NAV;
      }
      return match;
    });
    if (changed) content = replaced;
  }

  // Also fix 6-span hamburger buttons → 3 spans
  content = content.replace(
    /<button class="hamburger" id="hamburgerBtn" aria-label="Open menu"><span><\/span><span><\/span><span><\/span><span><\/span><span><\/span><span><\/span><\/button>/g,
    '<button class="hamburger" id="hamburgerBtn" aria-label="Open menu"><span></span><span></span><span></span></button>'
  );

  if (changed) {
    fs.writeFileSync(fullPath, content, 'utf8');
    updated++;
    console.log(`  updated: ${file}`);
  } else {
    skipped++;
  }
}

console.log(`\nNav update complete. Updated: ${updated}, Skipped: ${skipped}`);
