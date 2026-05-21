const fs = require('fs');
const path = require('path');

const NEW_FOOTER = `<footer class="footer-sitemap">
  <div class="footer-sitemap-grid">

    <div class="footer-col">
      <p class="footer-col-heading">Tools</p>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/decoder-tool">Serial Number Decoder</a></li>
        <li><a href="/smart-lookup">Smart Lookup</a></li>
        <li><a href="/large-loss-decoder">Large Loss Decoder</a></li>
        <li><a href="/assistant">AI Assistant</a></li>
        <li><a href="/brands">All Brands</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <p class="footer-col-heading">By Appliance</p>
      <ul>
        <li><a href="/refrigerator-serial-number">Refrigerators</a></li>
        <li><a href="/washer-serial-number">Washing Machines</a></li>
        <li><a href="/dryer-serial-number">Dryers</a></li>
        <li><a href="/dishwasher-serial-number">Dishwashers</a></li>
        <li><a href="/range-oven-serial-number">Ranges &amp; Ovens</a></li>
        <li><a href="/hvac-age-by-serial-number">HVAC Systems</a></li>
        <li><a href="/how-to-find-hvac-age">Finding HVAC Age</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <p class="footer-col-heading">By Brand</p>
      <ul>
        <li><a href="/whirlpool-serial-number-lookup">Whirlpool</a></li>
        <li><a href="/ge-serial-number-lookup">GE</a></li>
        <li><a href="/samsung-serial-number-lookup">Samsung</a></li>
        <li><a href="/lg-serial-number-lookup">LG</a></li>
        <li><a href="/carrier-serial-number-lookup">Carrier</a></li>
        <li><a href="/goodman-serial-number-lookup">Goodman</a></li>
        <li><a href="/trane-serial-number-lookup">Trane</a></li>
        <li><a href="/rheem-serial-number-lookup">Rheem</a></li>
        <li><a href="/frigidaire-serial-number-lookup">Frigidaire</a></li>
        <li><a href="/maytag-serial-number-lookup">Maytag</a></li>
        <li><a href="/kenmore-serial-number-lookup">Kenmore</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <p class="footer-col-heading">Item History Guides</p>
      <ul>
        <li><a href="/item-history-guides">All History Guides</a></li>
        <li><a href="/electrical-service-panel-history">Electrical Panels</a></li>
        <li><a href="/electrical-wiring-history">Electrical Wiring</a></li>
        <li><a href="/hvac-system-history">HVAC Systems</a></li>
        <li><a href="/water-heater-history">Water Heaters</a></li>
        <li><a href="/major-appliances-history">Major Appliances</a></li>
        <li><a href="/tv-history">TVs</a></li>
        <li><a href="/computer-history">Computers</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <p class="footer-col-heading">Resources</p>
      <ul>
        <li><a href="/how-old-is-my-appliance">How Old Is My Appliance?</a></li>
        <li><a href="/how-old-is-my-hvac">How Old Is My HVAC?</a></li>
        <li><a href="/how-old-is-my-plumbing">How Old Is My Water Heater?</a></li>
        <li><a href="/how-old-is-my-electronics">How Old Is My Electronics?</a></li>
        <li><a href="/serial-number-location-guide">Serial Number Location Guide</a></li>
        <li><a href="/appliance-age-for-insurance-and-replacement">Appliance Age for Insurance</a></li>
        <li><a href="/how-to-read-serial-number">How to Read a Serial Number</a></li>
        <li><a href="/methodology">Methodology</a></li>
        <li><a href="/about">About</a></li>
      </ul>
    </div>

  </div>

  <div class="footer-bottom">
    <span class="footer-bottom-copy">
      &copy; 2026 Decode My Item &middot; Database verified February 2026
    </span>
    <div class="footer-bottom-links">
      <a href="/contact">Contact</a>
      <a href="/security">Security &amp; Data</a>
      <a href="/privacy-policy">Privacy Policy</a>
    </div>
  </div>
</footer>`;

const htmlFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.html'));
let updated = 0, skipped = 0;

for (const file of htmlFiles) {
  const fullPath = path.join(__dirname, '..', file);
  const original = fs.readFileSync(fullPath, 'utf8');
  const replaced = original.replace(/<footer[\s\S]*?<\/footer>/g, NEW_FOOTER);
  if (replaced !== original) {
    fs.writeFileSync(fullPath, replaced, 'utf8');
    updated++;
  } else {
    skipped++;
  }
}

console.log(`Footer update complete. Updated: ${updated}, Skipped (no footer): ${skipped}`);
