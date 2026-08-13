import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const siteUrl = 'https://www.decodemyitem.com';
const decoderBundleManifestPath = path.join(root, 'assets', 'decoders', 'decoder-bundles.json');
const decoderBundleManifest = fs.existsSync(decoderBundleManifestPath)
  ? JSON.parse(fs.readFileSync(decoderBundleManifestPath, 'utf8'))
  : {};

const navLinks = `
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
`;

const applianceBrandLinks = [
  ['whirlpool-serial-number-lookup', 'Whirlpool'],
  ['ge-serial-number-lookup', 'GE'],
  ['samsung-serial-number-lookup', 'Samsung'],
  ['lg-serial-number-lookup', 'LG'],
  ['frigidaire-serial-number-lookup', 'Frigidaire'],
  ['maytag-serial-number-lookup', 'Maytag'],
  ['kenmore-serial-number-lookup', 'Kenmore'],
  ['bosch', 'Bosch'],
  ['goodman-serial-number-lookup', 'Goodman'],
  ['asus-serial-number-decoder', 'ASUS']
];

const applianceTypeLinks = [
  ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
  ['appliance-age-for-insurance-and-replacement', 'Insurance, Repair & Replacement'],
  ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
  ['washer-serial-number', 'Washer Serial Number Lookup'],
  ['dryer-serial-number', 'Dryer Serial Number Lookup'],
  ['dishwasher-serial-number', 'Dishwasher Serial Number Lookup'],
  ['range-oven-serial-number', 'Range & Oven Serial Number Lookup'],
  ['find-model-serial-number', 'Find Model & Serial Number Labels']
];

const hvacLinks = [
  ['hvac-age-by-serial-number', 'HVAC Age by Serial Number'],
  ['how-to-find-hvac-age', 'How to Find HVAC Age'],
  ['carrier-serial-number-lookup', 'Carrier'],
  ['trane-serial-number-lookup', 'Trane'],
  ['rheem-serial-number-lookup', 'Rheem'],
  ['goodman-serial-number-lookup', 'Goodman']
];

const electronicsLinks = [
  ['asus-serial-number-decoder', 'ASUS Serial Number Lookup'],
  ['samsung-tv-serial-number-decoder', 'Samsung TV Serial Number Decoder'],
  ['apple', 'Apple Identifier Guide'],
  ['hp', 'HP Serial Date Codes'],
  ['sony', 'Sony TV Model Year Guide'],
  ['vizio', 'Vizio Model Year Guide'],
  ['bosch', 'Bosch Appliance FD Numbers'],
  ['find-model-serial-number', 'Find Device Labels']
];

const trustBullets = [
  'Built for fast serial/model research.',
  'Useful for appliance age estimates, replacement research, and claim documentation.',
  'Results may vary by brand, model family, and available serial data.'
];

const defaultHowToSteps = [
  'Choose the matching category and brand.',
  'Enter the full serial number exactly as printed on the label.',
  'Review the date estimate, notes, and fallback links if the serial does not decode.'
];

function canonical(slug) {
  return `${siteUrl}/${slug}`;
}

function normalizeGeneratedHtml(html) {
  return html.replace(/[ \t]+$/gm, '');
}

function scriptJson(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function decoderBundleSrc(category) {
  const key = category === 'water-heaters' ? 'waterHeaters' : category;
  return decoderBundleManifest[key] || decoderBundleManifest.appliances || '';
}

function isBrandSerialLookupPage(page) {
  return /-serial-number-lookup$/.test(page.slug);
}

function pageSiteLabel(page) {
  return 'Decode My Item';
}

function pageHtmlTitle(page) {
  if (page.htmlTitleOverride) return page.htmlTitleOverride;
  const siteLabel = pageSiteLabel(page);
  return page.title.includes('Item Assist') ? page.title.replace('Item Assist', siteLabel) : `${page.title} | ${siteLabel}`;
}

function pageMetaDescription(page) {
  return page.metaDescriptionOverride || page.description;
}

function pageSocialTitle(page) {
  const baseTitle = page.socialTitleOverride || page.title;
  return baseTitle.includes('Item Assist') ? baseTitle.replace('Item Assist', 'Decode My Item') : `${baseTitle} | Decode My Item`;
}

function pageSocialDescription(page) {
  return page.socialDescriptionOverride || page.description;
}

function breadcrumbItems(items) {
  return items.map((item, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: item.name,
    item: item.url
  }));
}

function renderFaqSchema(faqs, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    mainEntity: faqs.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer
      }
    }))
  };
}

function renderHowToSchema(title, steps, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    '@id': `${url}#howto`,
    name: title,
    description: steps.join(' '),
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: `Step ${index + 1}`,
      text: step
    }))
  };
}

function renderBreadcrumbSchema(items, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: breadcrumbItems(items)
  };
}

function renderWebPageSchema(page, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    name: page.socialTitleOverride || page.title,
    description: pageSocialDescription(page),
    url,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: 'Decode My Item',
      url: siteUrl
    },
    about: {
      '@type': 'Thing',
      name: page.h1
    }
  };
}

function renderWebApplicationSchema(page, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${url}#app`,
    name: page.applicationName || 'Decode My Item Serial Number Decoder',
    url,
    description: page.decoderIntro || page.description,
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD'
    }
  };
}

function renderFaqHtml(faqs) {
  return faqs.map(([question, answer]) => `
          <details class="faq-item" open>
            <summary>${question}</summary>
            <div class="faq-answer"><p>${answer}</p></div>
          </details>`).join('');
}

function renderHowToHtml(steps) {
  return steps.map((step, index) => `
            <li><span class="how-list-index">${index + 1}</span><span>${step}</span></li>`).join('');
}

function renderLinks(links) {
  return links.map(([slug, label]) => `<a href="/${slug}">${label}</a>`).join('');
}

function renderLinkGroupCards(groups) {
  return groups.map((group) => `
        <article class="link-group-card">
          <h3>${group.title}</h3>
          <div class="link-pill-grid">${renderLinks(group.links)}</div>
        </article>`).join('');
}

function renderFormatTable(rows) {
  return rows.map((row) => `
            <tr>
              <td>${row.label}</td>
              <td>${row.pattern}</td>
              <td>${row.meaning}</td>
              <td>${row.confidence}</td>
            </tr>`).join('');
}

function renderExampleCards(rows) {
  return rows.map((row) => `
          <article class="example-card">
            <div class="example-eyebrow">${row.label}</div>
            <code>${row.serial}</code>
            <p>${row.note}</p>
          </article>`).join('');
}

function renderChecklist(items) {
  return items.map((item) => `<li>${item}</li>`).join('');
}

function renderLocationBlocks(blocks) {
  return blocks.map((block) => `
          <article class="mini-card">
            <h3>${block.title}</h3>
            <ul class="bullet-list">${renderChecklist(block.items)}</ul>
          </article>`).join('');
}

function renderJumpLinks(links) {
  return links.map((link) => `<a href="${link.href}">${link.label}</a>`).join('');
}

function renderInfoRows(rows) {
  return rows.map((row) => `
            <tr>
              <td>${row.field}</td>
              <td>${row.meaning}</td>
              <td>${row.why}</td>
            </tr>`).join('');
}

function renderOrderedSteps(items) {
  return items.map((item, index) => `
            <li><span class="how-list-index">${index + 1}</span><span>${item}</span></li>`).join('');
}

function renderExtraSections(sections = []) {
  return sections.map((section) => {
    const sectionId = section.id ? ` id="${section.id}"` : '';
    if (section.type === 'jump-links') {
      return `
    <section class="section"${sectionId}>
      <div class="seo-copy-wrap">
        <h2>${section.title}</h2>
        <div class="related-brands">${renderJumpLinks(section.links)}</div>
      </div>
    </section>`;
    }

    if (section.type === 'mini-grid') {
      return `
    <section class="section"${sectionId}>
      <div class="seo-copy-wrap">
        <h2>${section.title}</h2>
        ${section.intro ? `<p>${section.intro}</p>` : ''}
      </div>
      <div class="seo-copy-wrap">
        <div class="mini-card-grid">${renderLocationBlocks(section.blocks)}</div>
      </div>
    </section>`;
    }

    if (section.type === 'table') {
      return `
    <section class="section"${sectionId}>
      <div class="seo-copy-wrap">
        <h2>${section.title}</h2>
        ${section.intro ? `<p>${section.intro}</p>` : ''}
        <div class="table-wrap">
          <table class="format-table">
            <thead>
              <tr>
                <th>Label Field</th>
                <th>What It Usually Means</th>
                <th>Why It Matters</th>
              </tr>
            </thead>
            <tbody>${renderInfoRows(section.rows)}</tbody>
          </table>
        </div>
      </div>
    </section>`;
    }

    if (section.type === 'ordered-list') {
      return `
    <section class="section"${sectionId}>
      <div class="seo-copy-wrap">
        <h2>${section.title}</h2>
        ${section.intro ? `<p>${section.intro}</p>` : ''}
        <ol class="how-steps how-steps-list how-steps-stack">${renderOrderedSteps(section.items)}
        </ol>
      </div>
    </section>`;
    }

    if (section.type === 'link-cards') {
      return `
    <section class="section"${sectionId}>
      <div class="seo-copy-wrap">
        <h2>${section.title}</h2>
        ${section.intro ? `<p>${section.intro}</p>` : ''}
      </div>
      <div class="seo-copy-wrap">
        <div class="link-group-grid">${renderLinkGroupCards(section.groups)}</div>
      </div>
    </section>`;
    }

    if (section.type === 'copy-block') {
      return `
    <section class="section"${sectionId}>
      <div class="seo-copy-wrap">
        <h2>${section.title}</h2>
        ${section.body.map((paragraph) => `<p>${paragraph}</p>`).join('')}
      </div>
    </section>`;
    }

    if (section.type === 'raw') {
      return section.html || '';
    }

    return '';
  }).join('');
}

function renderBreadcrumbHtml(breadcrumbs) {
  return breadcrumbs.map((item, index) => index === breadcrumbs.length - 1
    ? `<span aria-current="page">${item.name}</span>`
    : `<a href="${item.url.replace(siteUrl, '') || '/'}">${item.name}</a>`).join('<span class="breadcrumb-sep">/</span>');
}

function renderDecoderModule(page, opts = {}) {
  const shellClass = opts.shellClass ? ` ${opts.shellClass}` : '';
  const wrapperClass = opts.wrapperClass || 'tool-focus-wrap';
  const includeUtility = opts.includeUtility !== false;
  return `
      <div class="${wrapperClass}">
        <div class="seo-tool-shell${shellClass}">
          <div class="home-tools-wrap">
            <div class="home-tools-grid">
              <div class="decoder-card-shell">
                <div class="search-box">
                  <div class="search-tabs">
                    <button class="search-tab cat-tab${page.category === 'appliances' ? ' active' : ''}" data-cat="appliances" onclick="selectCategory('appliances', this)">Appliances</button>
                    <button class="search-tab cat-tab${page.category === 'waterHeaters' ? ' active' : ''}" data-cat="waterHeaters" onclick="selectCategory('waterHeaters', this)">Water Heaters</button>
                    <button class="search-tab cat-tab${page.category === 'hvac' ? ' active' : ''}" data-cat="hvac" onclick="selectCategory('hvac', this)">HVAC</button>
                    <button class="search-tab cat-tab${page.category === 'electronics' ? ' active' : ''}" data-cat="electronics" onclick="selectCategory('electronics', this)">Electronics</button>
                  </div>

                  <div class="search-panel" id="panel-decoder">
                    <!-- Brand Row -->
                    <div class="tool-input-group brand-row">
                      <label for="brand">Select Brand</label>
                      <select id="brand" class="search-select">
                        <option value="">-- Select Brand --</option>
                      </select>
                    </div>

                    <!-- Serial Row -->
                    <div class="tool-input-group serial-row">
                      <label class="serial-label" for="serial">Enter Serial Number</label>
                      <input type="text" id="serial" class="search-input" placeholder="${page.decoderPlaceholder || 'Enter serial number exactly as shown'}">
                    </div>

                    <!-- Era Group -->
                    <div class="era-group hidden" id="eraGroup" style="margin-top: 16px;">
                      <label for="eraSelect">Manufacture Era</label>
                      <select id="eraSelect" class="search-select" style="margin-top: 8px;">
                        <option value="">-- Select Era --</option>
                        <option value="post">Post-2006</option>
                        <option value="pre">Pre-2006</option>
                      </select>
                      <p class="era-note">Some brands reuse serial layouts across decades. Select the era when prompted to improve accuracy.</p>
                    </div>

                    <!-- Helper Text -->
                    <p class="search-hint serial-helper-text" style="margin-top: 16px;">${page.decoderIntro}</p>

                    <!-- Action Button -->
                    <div class="tool-panel-action" style="margin-top: 24px;">
                      <button id="decodeBtn" class="btn-primary power-btn" type="button" disabled onclick="decodeSerial()">Decode Serial Number</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${includeUtility ? `<div class="utility-strip">${trustBullets.map((item) => `<span>${item}</span>`).join('')}</div>` : ''}
      </div>`;
}

function renderResultsShell() {
  return `
    <div class="results-wrapper">
      <div id="ageLoading" class="results-card hidden">
        <div class="loading-inner">
          <span class="loading-emoji lightning" id="loadingEmoji">&#127785;&#65039;</span>
          <div class="loading-text" id="loadingText">Researching product information...</div>
        </div>
      </div>

      <div id="serialResults" class="results-card hidden">
        <div class="results-header">
          <h3>Decoded Results</h3>
          <div class="brand-logo-wrap" id="serialBrandLogo"></div>
        </div>
        <div class="results-body">
          <div id="serialSummaryLayer" class="sl-top-summary-layer serial-summary-layer hidden"></div>
          <div class="serial-legacy-fields" hidden aria-hidden="true">
            <div class="result-row result-row--primary">
              <span class="result-label">Manufacture Date</span>
              <span class="result-value" id="resultYear"></span>
            </div>
            <div class="result-row" id="resultMonthRow">
              <span class="result-label">Month / Period</span>
              <span class="result-value" id="resultMonth"></span>
            </div>
            <div class="result-row">
              <span class="result-label">Brand</span>
              <span class="result-value" id="resultBrand"></span>
            </div>
            <div class="result-row">
              <span class="result-label">Estimated Age</span>
              <span class="result-value" id="resultEstimatedAge">&mdash;</span>
            </div>
            <div class="info-block method">
              <h4>Decoding Method</h4>
              <p id="resultMethod"></p>
            </div>
            <div class="info-block notes">
              <h4>Important Notes</h4>
              <p id="resultNotes"></p>
            </div>
            <details class="determination-details">
              <summary>How this was determined</summary>
              <div class="determination-body" id="serialDeterminationBody">
                We use the brand-specific serial rules already supported in Decode My Item. When a brand repeats codes across decades, the result stays estimated until model era or installation context confirms the right cycle.
              </div>
            </details>
          </div>
        </div>
        <div class="results-footer">
          <button class="copy-btn" onclick="copyClaimFile()">Copy Information</button>
          <button class="decode-again-btn btn-amber" onclick="decodeAnotherItem()">Decode Another Item</button>
          <button class="decode-again-btn btn-teal" onclick="window.location.href='/smart-lookup'">Use Smart Lookup</button>
          <button class="error-btn" onclick="openFeedbackModal()">Possible Error?</button>
        </div>
      </div>
    </div>`;
}

function renderSerialLocationIllustration(kind, marker, label) {
  const markerCircle = marker ? `
      <circle cx="${marker.x}" cy="${marker.y}" r="10" fill="#3182ce"></circle>
      <circle cx="${marker.x}" cy="${marker.y}" r="20" fill="none" stroke="rgba(49,130,206,0.28)" stroke-width="8"></circle>` : '';

  const shapes = {
    refrigerator: `
      <rect x="96" y="20" width="126" height="228" rx="18" fill="#f8fbff" stroke="#7fb0e6" stroke-width="6"></rect>
      <line x1="96" y1="112" x2="222" y2="112" stroke="#7fb0e6" stroke-width="6"></line>
      <line x1="208" y1="58" x2="208" y2="92" stroke="#1a202c" stroke-width="6" stroke-linecap="round"></line>
      <line x1="208" y1="144" x2="208" y2="208" stroke="#1a202c" stroke-width="6" stroke-linecap="round"></line>
      <rect x="84" y="244" width="150" height="12" rx="6" fill="#c6dcf5"></rect>`,
    washer: `
      <rect x="78" y="28" width="164" height="208" rx="18" fill="#f8fbff" stroke="#7fb0e6" stroke-width="6"></rect>
      <rect x="92" y="42" width="136" height="26" rx="8" fill="#dcecff"></rect>
      <circle cx="160" cy="146" r="56" fill="#eaf4ff" stroke="#7fb0e6" stroke-width="6"></circle>
      <circle cx="160" cy="146" r="26" fill="#c8dff6"></circle>`,
    dryer: `
      <rect x="78" y="28" width="164" height="208" rx="18" fill="#f8fbff" stroke="#7fb0e6" stroke-width="6"></rect>
      <circle cx="160" cy="142" r="56" fill="#eef6ff" stroke="#7fb0e6" stroke-width="6"></circle>
      <circle cx="160" cy="142" r="30" fill="#daeafc"></circle>
      <rect x="118" y="52" width="84" height="18" rx="9" fill="#dcecff"></rect>`,
    dishwasher: `
      <rect x="84" y="24" width="152" height="220" rx="18" fill="#f8fbff" stroke="#7fb0e6" stroke-width="6"></rect>
      <rect x="96" y="42" width="128" height="22" rx="8" fill="#dcecff"></rect>
      <rect x="106" y="82" width="108" height="130" rx="12" fill="#edf6ff" stroke="#bfd7f2" stroke-width="4"></rect>`,
    range: `
      <rect x="78" y="38" width="164" height="198" rx="18" fill="#f8fbff" stroke="#7fb0e6" stroke-width="6"></rect>
      <rect x="84" y="24" width="152" height="24" rx="10" fill="#dcecff"></rect>
      <circle cx="118" cy="34" r="7" fill="#3182ce"></circle>
      <circle cx="158" cy="34" r="7" fill="#3182ce"></circle>
      <circle cx="198" cy="34" r="7" fill="#3182ce"></circle>
      <rect x="110" y="102" width="100" height="90" rx="12" fill="#eef6ff" stroke="#bfd7f2" stroke-width="4"></rect>`,
    hvac: `
      <rect x="62" y="74" width="96" height="122" rx="16" fill="#f8fbff" stroke="#7fb0e6" stroke-width="6"></rect>
      <circle cx="110" cy="136" r="32" fill="#eaf4ff" stroke="#7fb0e6" stroke-width="6"></circle>
      <circle cx="110" cy="136" r="9" fill="#7fb0e6"></circle>
      <rect x="176" y="52" width="84" height="154" rx="16" fill="#eef6ff" stroke="#7fb0e6" stroke-width="6"></rect>
      <rect x="190" y="76" width="56" height="18" rx="8" fill="#dcecff"></rect>`,
    electronics: `
      <rect x="56" y="46" width="208" height="126" rx="18" fill="#f8fbff" stroke="#7fb0e6" stroke-width="6"></rect>
      <rect x="72" y="60" width="176" height="92" rx="10" fill="#edf6ff"></rect>
      <rect x="118" y="178" width="84" height="10" rx="5" fill="#7fb0e6"></rect>
      <rect x="142" y="188" width="36" height="22" rx="8" fill="#bfd7f2"></rect>`
  };

  return `
    <div class="serial-illustration-shell" role="img" aria-label="${label}">
      <svg viewBox="0 0 320 272" class="serial-illustration-svg" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="panelGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffffff"></stop>
            <stop offset="100%" stop-color="#e8f3ff"></stop>
          </linearGradient>
        </defs>
        <rect x="12" y="12" width="296" height="248" rx="28" fill="url(#panelGlow)" stroke="#d5e7f7" stroke-width="4"></rect>
        ${shapes[kind] || shapes.refrigerator}
        ${markerCircle}
      </svg>
    </div>`;
}

function renderHeroFridgeDiagram() {
  return `
    <div class="serial-hero-diagram" aria-label="Illustrated refrigerator serial number locations">
      ${renderSerialLocationIllustration('refrigerator', { x: 214, y: 178 }, 'Refrigerator with common serial label locations highlighted')}
      <div class="diagram-callout callout-top-left"><span class="diagram-dot"></span><div><strong>Inside fresh food compartment</strong><small>Often on the interior wall or liner</small></div></div>
      <div class="diagram-callout callout-top-right"><span class="diagram-dot"></span><div><strong>Side wall</strong><small>Common first check on many fridges</small></div></div>
      <div class="diagram-callout callout-mid-right"><span class="diagram-dot"></span><div><strong>Door frame</strong><small>Look around the main cabinet opening</small></div></div>
      <div class="diagram-callout callout-bottom-left"><span class="diagram-dot"></span><div><strong>Behind lower kick plate</strong><small>Fallback location on some models</small></div></div>
    </div>`;
}

function renderJumpNavCards(items) {
  return items.map((item) => `
          <a class="jump-nav-card" href="${item.href}">
            <span class="jump-icon">${item.icon}</span>
            <span class="jump-copy">
              <strong>${item.label}</strong>
              <small>${item.meta}</small>
            </span>
          </a>`).join('');
}

function renderApplianceLocationCards(cards) {
  return cards.map((card) => {
    if (card.type === 'value-card') {
      return `
          <article class="appliance-location-card appliance-location-card--value">
            <div class="value-card-badge">Field-service utility</div>
            <h3>${card.title}</h3>
            <ul class="bullet-list">${renderChecklist(card.items)}</ul>
            <a class="location-card-link location-card-link--button" href="${card.href}">${card.cta}</a>
          </article>`;
    }

    return `
          <article class="appliance-location-card" id="${card.id}">
            <div class="location-visual">
              ${renderSerialLocationIllustration(card.kind, card.marker, card.alt)}
            </div>
            <div class="location-card-body">
              <h3>${card.title}</h3>
              <ul class="bullet-list">${renderChecklist(card.items)}</ul>
              <a class="location-card-link" href="${card.href}">${card.linkLabel}</a>
            </div>
          </article>`;
  }).join('');
}

function renderLabelExampleRows(rows) {
  return rows.map((row) => `
              <tr>
                <td>${row.num}</td>
                <td>${row.field}</td>
                <td>${row.meaning}</td>
                <td>${row.why}</td>
              </tr>`).join('');
}

function renderMissingHelpCards(cards) {
  return cards.map((card) => `
          <article class="missing-help-card">
            <span class="missing-help-icon">${card.icon}</span>
            <p>${card.text}</p>
          </article>`).join('');
}

function renderWhereIsMySerialNumberPage(page, url, breadcrumbs, schema, preselectScript) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-C3TXQS1DYP"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-C3TXQS1DYP');
  </script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5946778263750869" crossorigin="anonymous"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <title>${pageHtmlTitle(page)}</title>
  <meta name="description" content="${pageMetaDescription(page)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:locale" content="en_US">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${pageSiteLabel(page)}">
  <meta property="og:title" content="${pageSocialTitle(page)}">
  <meta property="og:description" content="${pageSocialDescription(page)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${siteUrl}/assets/decodemyitem-social-preview.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Decode My Item — Serial Number Decoder &amp; Age Lookup">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageSocialTitle(page)}">
  <meta name="twitter:description" content="${pageSocialDescription(page)}">
  <meta name="twitter:image" content="${siteUrl}/assets/decodemyitem-social-preview.png">
  <link rel="stylesheet" href="shared.css">
  <link rel="stylesheet" href="responsive-navigation.css">
  <link rel="stylesheet" href="seo-landing.css">
  <style>
    .loc-cards-grid, .loc-card, .loc-card-head, .loc-list { min-width: 0; }
    .loc-list li, .loc-list a { overflow-wrap: anywhere; }
    @media (max-width: 360px) {
      .bp-content-wrap, .bp-section-card, .loc-cards-grid, .loc-card { width: 100%; max-width: 100%; }
      .loc-cards-grid { display: block; }
      .loc-card + .loc-card { margin-top: 14px; }
    }
  </style>
  <link rel="icon" type="image/png" href="favicon.png">
</head>
<body class="serial-location-page" data-page-kind="brand-page">
  <nav>
    <a href="/" class="logo" aria-label="Decode My Item home">
      <div>
        <div class="logo-text">Decode My <span>Item</span></div>
        <div class="logo-sub">Decode - Research - Automate</div>
      </div>
    </a>
    <button class="hamburger" id="hamburgerBtn" aria-label="Open menu"><span></span><span></span><span></span><span></span><span></span><span></span></button>
    <ul>${navLinks}
    </ul>
  </nav>

  <main>
    <section class="section serial-location-hero">
      <div class="serial-location-hero-grid">
        <div class="serial-location-copy">
          <nav class="breadcrumb-nav breadcrumb-nav-left" aria-label="Breadcrumb">
            ${renderBreadcrumbHtml(breadcrumbs)}
          </nav>
          <div class="tool-badge serial-light-badge">${page.badge}</div>
          <h1>${page.h1}</h1>
          <p class="serial-hero-subtitle">${page.subtitle}</p>
          ${renderDecoderModule(page, { wrapperClass: 'serial-location-decoder-wrap', shellClass: 'serial-decoder-card' })}
        </div>
        ${renderHeroFridgeDiagram()}
      </div>
    </section>

    ${renderResultsShell()}

    <section class="section serial-jump-section">
      <div class="seo-copy-wrap">
        <h2>Jump to the right product type</h2>
        <p>Start with the product family you have in front of you. Each jump card lands on the most common label locations and the fastest next lookup path.</p>
      </div>
      <div class="seo-copy-wrap">
        <div class="appliance-jump-grid">
          ${renderJumpNavCards(page.jumpCards)}
        </div>
      </div>
    </section>

    ${page.featuredCallout ? `
    <section class="section">
      <div class="seo-copy-wrap">
        <div class="cta-note">
          <h2>${page.featuredCallout.title}</h2>
          <p><a href="${page.featuredCallout.href}">${page.featuredCallout.linkLabel}</a></p>
        </div>
      </div>
    </section>` : ''}

    <section class="section" id="location-cards">
      <div class="seo-copy-wrap">
        <h2>Appliance, HVAC, and electronics serial number locations</h2>
        <p>Use these visual location cards when you need a fast field reference before opening the decoder or documenting the label for service, claims, or replacement research.</p>
      </div>
      <div class="seo-copy-wrap">
        <div class="appliance-location-grid">
          ${renderApplianceLocationCards(page.locationCards)}
        </div>
      </div>
    </section>

    <section class="section label-example-section" id="label-examples">
      <div class="seo-copy-wrap">
        <h2>What Does the Serial Number Label Look Like?</h2>
      </div>
      <div class="seo-copy-wrap">
        <div class="label-example-grid">
          <div class="label-diagram-panel">
            <div class="label-plate" role="img" aria-label="Example appliance serial label showing brand, model number, serial number, and manufacture date callouts">
              <div class="label-plate-header">Whirlpool</div>
              <div class="label-plate-row"><span>MOD.</span><strong>WRF535SWHZ00</strong></div>
              <div class="label-plate-row"><span>SER.</span><strong>D12345678</strong></div>
              <div class="label-plate-row"><span>MFD.</span><strong>04/2019</strong></div>
              <div class="label-plate-row"><span>TYPE</span><strong>BCDM-000</strong></div>
              <div class="label-plate-row"><span>ELEC</span><strong>120V 60Hz 5.0A</strong></div>
              <div class="label-callout label-callout-1"><span>1</span><small>Brand / manufacturer</small></div>
              <div class="label-callout label-callout-2"><span>2</span><small>Model number</small></div>
              <div class="label-callout label-callout-3"><span>3</span><small>Serial number</small></div>
              <div class="label-callout label-callout-4"><span>4</span><small>Manufacture date / code</small></div>
            </div>
          </div>
          <div class="label-table-panel">
            <div class="table-wrap">
              <table class="label-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Label Field</th>
                    <th>What It Usually Means</th>
                    <th>Why It Matters</th>
                  </tr>
                </thead>
                <tbody>${renderLabelExampleRows(page.labelRows)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section missing-label-strip" id="missing-label">
      <div class="seo-copy-wrap missing-strip-head">
        <div>
          <h2>Can't Find Your Serial Number?</h2>
          <p>Use the fallback checks below before assuming the label is gone. A quick photo, manual, or lower access cover often solves the problem.</p>
        </div>
        <a class="location-card-link location-card-link--button" href="/smart-lookup">View Smart Lookup</a>
      </div>
      <div class="seo-copy-wrap">
        <div class="missing-help-grid">
          ${renderMissingHelpCards(page.missingHelp)}
        </div>
      </div>
    </section>

    <section class="section faq-light-section">
      <div class="seo-copy-wrap">
        <h2>FAQ</h2>
        <div class="faq-list faq-list-light">${renderFaqHtml(page.faqs)}
        </div>
      </div>
    </section>

    <section class="section related-section">
      <div class="seo-copy-wrap">
        <h2>Related Decoder Pages</h2>
        <div class="related-brands related-brands-light">${renderLinks(page.relatedLinks)}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="seo-copy-wrap">
        <h2>Research Paths</h2>
        <div class="link-group-grid">${renderLinkGroupCards(page.linkGroups)}
        </div>
      </div>
    </section>
  </main>

  <div id="feedbackModal" class="modal-overlay hidden" onclick="if(event.target===this)closeFeedbackModal()">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Report an Issue</h3>
        <button class="modal-close" onclick="closeFeedbackModal()">&#x2715;</button>
      </div>
      <div class="modal-body">
        <div class="modal-field">
          <label class="sr-only" for="fbBrand">Brand</label>
          <input type="text" id="fbBrand" class="form-input" readonly>
        </div>
        <div class="modal-field">
          <label class="sr-only" for="fbSerial">Serial Number / Search Query</label>
          <input type="text" id="fbSerial" class="form-input" readonly>
        </div>
        <div class="modal-field">
          <label class="sr-only" for="fbType">Issue Type</label>
          <select id="fbType" class="form-select">
            <option value="">-- Select issue type --</option>
            <option value="wrong_year">Wrong year / date</option>
            <option value="wrong_month">Wrong month</option>
            <option value="wrong_brand">Wrong brand identified</option>
            <option value="format_error">Format / decode error</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="modal-field">
          <label class="sr-only" for="fbDetails">Details</label>
          <textarea id="fbDetails" class="form-input" rows="3" placeholder="What seems wrong?"></textarea>
        </div>
        <div id="fbThanks" class="fb-thanks hidden">Thank you. Your feedback helps improve the decoder.</div>
        <div id="fbActions" class="modal-actions">
          <button class="decode-btn" onclick="submitFeedback()">Submit Feedback</button>
          <button class="cancel-btn" onclick="closeFeedbackModal()">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <footer class="footer-sitemap">
  <div class="footer-sitemap-grid">

    <div class="footer-col">
      <p class="footer-col-heading">Tools</p>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/decoder-tool">Serial Number Decoder</a></li>
        <li><a href="/smart-lookup">Smart Lookup</a></li>
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
        <li><a href="/rheem-serial-number-lookup">Rheem HVAC</a></li>
        <li><a href="/frigidaire-serial-number-lookup">Frigidaire</a></li>
        <li><a href="/maytag-serial-number-lookup">Maytag</a></li>
        <li><a href="/kenmore-serial-number-lookup">Kenmore</a></li>
      </ul>
    </div>

    <div class="footer-col">
      <p class="footer-col-heading">Resources</p>
      <ul>
        <li><a href="/how-old-is-my-appliance">How Old Is My Appliance?</a></li>
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
</footer>

  <script>
    function selectCatAndShowDecoder(cat, btn) {
      if (typeof selectCategory === 'function') selectCategory(cat, btn);
    }

    function applySeoBrandSelection(attempt) {${preselectScript}
    }

    window.addEventListener('DOMContentLoaded', function() {
      var activeTab = document.querySelector('[data-cat="${page.category}"]');
      if (activeTab) selectCatAndShowDecoder('${page.category}', activeTab);
      applySeoBrandSelection(0);
    });

    window.addEventListener('pageshow', function () {
      var feedbackModal = document.getElementById('feedbackModal');
      var navList = document.querySelector('nav ul');
      var hamburger = document.getElementById('hamburgerBtn');

      if (!feedbackModal || feedbackModal.classList.contains('hidden')) {
        document.body.style.overflow = '';
      }
      document.body.classList.remove('nav-menu-open');
      if (navList) navList.classList.remove('open');
      if (hamburger) hamburger.classList.remove('active');
    });
  </script>
  <script defer src="${decoderBundleSrc(page.category)}"></script>
  <script defer src="lkq-engine.js"></script>
  <script defer src="analytics.js"></script>
  <script defer src="smart-lookup-bundle.js"></script>
  <script defer src="script.js"></script>
  <script defer src="responsive-navigation.js"></script>
  ${schema.map(scriptJson).join('\n  ')}
</body>
</html>`;
}

function renderPage(page) {
  const url = canonical(page.slug);
  const breadcrumbs = page.breadcrumbs || [
    { name: 'Home', url: siteUrl },
    { name: page.h1, url }
  ];
  const schema = page.indexable === false
    ? [renderWebPageSchema(page, url), renderBreadcrumbSchema(breadcrumbs, url)]
    : [
        renderWebPageSchema(page, url),
        renderBreadcrumbSchema(breadcrumbs, url),
        renderWebApplicationSchema(page, url),
        renderFaqSchema(page.faqs, url),
        renderHowToSchema(page.h1, page.howToSteps || defaultHowToSteps, url)
      ];
  const preselectScript = page.brandValue
    ? `
      var brandSelect = document.getElementById('brand');
      if (!brandSelect) return;
      if (brandSelect.options.length <= 1 && attempt < 12) {
        window.setTimeout(function() { applySeoBrandSelection(attempt + 1); }, 150);
        return;
      }
      brandSelect.value = '${page.brandValue}';
      brandSelect.dispatchEvent(new Event('change'));
      var mobileItemType = document.getElementById('mobileItemType');
      if (mobileItemType && Array.prototype.some.call(mobileItemType.options, function(option) { return option.value === '${page.category}'; })) {
        mobileItemType.value = '${page.category}';
        mobileItemType.dispatchEvent(new Event('change'));
      }
      ${page.inputMode === 'model' ? `
      var purposeLabel = document.querySelector('label[for="serial"]');
      var purposeInput = document.getElementById('serial');
      var purposeButton = document.getElementById('decodeBtn');
      if (purposeLabel) purposeLabel.textContent = '${page.inputLabel}';
      if (purposeInput) purposeInput.placeholder = '${page.decoderPlaceholder}';
      if (purposeButton) purposeButton.textContent = '${page.actionLabel}';` : ''}`
    : '';

  if (page.template === 'serial-location-hub') {
    return renderWhereIsMySerialNumberPage(page, url, breadcrumbs, schema, preselectScript);
  }

  // ── Category icon + color ──────────────────────────────────────────────
  const catMeta = {
    appliances:   { icon: 'kitchen',    color: '#44e5c2', label: 'Appliance Decoder' },
    hvac:         { icon: 'ac_unit',    color: '#9fcaff', label: 'HVAC Decoder'       },
    electronics:  { icon: 'devices',    color: '#c084fc', label: 'Electronics Decoder' },
    waterHeaters: { icon: 'water_drop', color: '#44e5c2', label: 'Water Heater Decoder' }
  };
  const cat = catMeta[page.category] || catMeta.appliances;

  // ── Location card icon mapping ─────────────────────────────────────────
  function locationIcon(title) {
    const t = title.toLowerCase();
    if (t.includes('refrigerator') || t.includes('fridge')) return 'kitchen';
    if (t.includes('washer') || t.includes('washing') || t.includes('laundry')) return 'local_laundry_service';
    if (t.includes('dryer')) return 'local_laundry_service';
    if (t.includes('dishwasher')) return 'dishwasher';
    if (t.includes('range') || t.includes('oven') || t.includes('stove') || t.includes('cooking')) return 'oven_gen';
    if (t.includes('furnace') || t.includes('hvac') || t.includes('air handler')) return 'heat_pump';
    if (t.includes('condenser') || t.includes('outdoor') || t.includes('ac ')) return 'ac_unit';
    if (t.includes('water heater')) return 'water_drop';
    if (t.includes('laptop') || t.includes('notebook')) return 'laptop';
    if (t.includes('tv') || t.includes('television')) return 'tv';
    if (t.includes('phone') || t.includes('tablet')) return 'smartphone';
    if (t.includes('console') || t.includes('gaming')) return 'sports_esports';
    return 'label';
  }

  // ── Confidence pill styling ────────────────────────────────────────────
  function confidencePill(text) {
    const t = (text || '').toLowerCase();
    if (t.includes('higher') || t.includes('confirmed') || t.includes('reliable')) {
      return `<span class="conf-pill conf-high">✓ ${text}</span>`;
    }
    if (t.includes('estimated decade') || t.includes('repeat') || t.includes('cycle')) {
      return `<span class="conf-pill conf-estimated">~ ${text}</span>`;
    }
    return `<span class="conf-pill conf-med">~ ${text}</span>`;
  }

  // ── Format cards (replaces table) ─────────────────────────────────────
  function renderFormatCards(rows) {
    if (!rows || !rows.length) return '';
    return rows.map(r => `
      <div class="fmt-card">
        <div class="fmt-card-top">
          <span class="fmt-label">${r.label}</span>
          ${confidencePill(r.confidence)}
        </div>
        <code class="fmt-serial">${r.pattern}</code>
        <p class="fmt-meaning">${r.meaning}</p>
      </div>`).join('');
  }

  // ── Example terminals ──────────────────────────────────────────────────
  function renderExampleTerminals(rows) {
    if (!rows || !rows.length) return '';
    return rows.map(r => `
      <div class="ex-terminal">
        <div class="ex-terminal-bar">
          <span class="ex-dot ex-dot-red"></span>
          <span class="ex-dot ex-dot-amber"></span>
          <span class="ex-dot ex-dot-green"></span>
          <span class="ex-eyebrow">${r.label}</span>
        </div>
        <code class="ex-serial">${r.serial}</code>
        <p class="ex-note">${r.note}</p>
      </div>`).join('');
  }

  // ── Location icon cards ────────────────────────────────────────────────
  function renderLocationIconCards(blocks) {
    if (!blocks || !blocks.length) return '';
    return blocks.map(b => `
      <div class="loc-card">
        <div class="loc-card-head">
          <span class="material-symbols-outlined loc-icon">${locationIcon(b.title)}</span>
          <h3 class="loc-card-title">${b.title}</h3>
        </div>
        <ul class="loc-list">${b.items.map(i => `<li>${i}</li>`).join('')}</ul>
      </div>`).join('');
  }

  // ── FAQ accordion ──────────────────────────────────────────────────────
  function renderFaqAccordion(faqs) {
    if (!faqs || !faqs.length) return '';
    return faqs.map(([q, a]) => `
      <details class="bp-faq-item">
        <summary class="bp-faq-summary">
          <span>${q}</span>
          <span class="material-symbols-outlined bp-faq-icon">expand_more</span>
        </summary>
        <div class="bp-faq-body"><p>${a}</p></div>
      </details>`).join('');
  }

  // ── Checklist ──────────────────────────────────────────────────────────
  function renderBulletChecklist(items) {
    if (!items || !items.length) return '';
    return items.map(i => `
      <li class="bp-check-item">
        <span class="material-symbols-outlined bp-check-icon">check_circle</span>
        <span>${i}</span>
      </li>`).join('');
  }

  // ── Related brand pills ────────────────────────────────────────────────
  function renderRelatedPills(links) {
    if (!links || !links.length) return '';
    return links.map(([slug, label]) =>
      `<a href="/${slug}" class="bp-pill">${label}</a>`).join('');
  }

  // ── Footer resource links (updated) ───────────────────────────────────
  const footerResources = [
    ['/how-old-is-my-appliance', 'How Old Is My Appliance?'],
    ['/how-old-is-my-hvac', 'How Old Is My HVAC?'],
    ['/how-old-is-my-plumbing', 'How Old Is My Water Heater?'],
    ['/how-old-is-my-electronics', 'How Old Is My Electronics?'],
    ['/serial-number-location-guide', 'Serial Number Location Guide'],
    ['/appliance-age-for-insurance-and-replacement', 'Appliance Age for Insurance'],
    ['/how-to-read-serial-number', 'How to Read a Serial Number'],
    ['/methodology', 'Methodology'],
    ['/about', 'About'],
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-C3TXQS1DYP"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-C3TXQS1DYP');
  </script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5946778263750869" crossorigin="anonymous"></script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.json">
  <title>${pageHtmlTitle(page)}</title>
  <meta name="description" content="${pageMetaDescription(page)}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="${page.indexable === false ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
  <meta property="og:locale" content="en_US">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${pageSiteLabel(page)}">
  <meta property="og:title" content="${pageSocialTitle(page)}">
  <meta property="og:description" content="${pageSocialDescription(page)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${siteUrl}/assets/decodemyitem-social-preview.png">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Decode My Item — Serial Number Decoder &amp; Age Lookup">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageSocialTitle(page)}">
  <meta name="twitter:description" content="${pageSocialDescription(page)}">
  <meta name="twitter:image" content="${siteUrl}/assets/decodemyitem-social-preview.png">
  <link rel="stylesheet" href="shared.css">
  <link rel="stylesheet" href="responsive-navigation.css">
  <link rel="stylesheet" href="seo-landing.css">
  <style>
    .section, .seo-copy-wrap, .table-wrap, .bp-content-wrap, .bp-section-card { min-width: 0; }
    .conf-pill { max-width: 100%; white-space: normal; overflow-wrap: anywhere; flex-shrink: 1; }
  </style>
  <link rel="icon" type="image/png" href="favicon.png">
</head>
<body data-page-kind="brand-page">

  <!-- ═══ NAV ═══ -->
  <nav>
  <a href="/" class="logo" aria-label="Decode My Item home">
    <span class="material-symbols-outlined" style="color:#44e5c2;font-size:26px;flex-shrink:0;line-height:1;">qr_code_scanner</span>
    <div>
      <div class="logo-text">Decode My <span>Item</span></div><div class="logo-sub">Decode - Research - Automate</div>
    </div>
  </a>
  <button class="hamburger" id="hamburgerBtn" aria-label="Open menu"><span></span><span></span><span></span></button>
  <ul>${navLinks}
</ul>
</nav>

  <main>

    <!-- ═══ HERO ═══ -->
    <section class="bp-hero">
      <div class="bp-hero-inner">
        <nav class="breadcrumb-nav" aria-label="Breadcrumb">
          ${breadcrumbs.map((item, i) => i === breadcrumbs.length - 1
            ? `<span aria-current="page">${item.name}</span>`
            : `<a href="${item.url.replace(siteUrl,'') || '/'}">${item.name}</a>`
          ).join('<span class="breadcrumb-sep">/</span>')}
        </nav>

        <div class="bp-hero-icon-wrap" style="background:${cat.color}18;border-color:${cat.color}30;">
          <span class="material-symbols-outlined bp-hero-icon" style="color:${cat.color};">${cat.icon}</span>
        </div>

        <span class="bp-badge" style="color:${cat.color};border-color:${cat.color}30;background:${cat.color}10;">
          ${page.badge || cat.label}
        </span>
${page.wordmark ? `
        <div class="bp-hero-wordmark" style="font-family:Arial, Helvetica, sans-serif;font-weight:800;font-size:26px;letter-spacing:1px;color:#00382d;background:${cat.color};border-radius:8px;padding:4px 14px;display:inline-block;margin-bottom:14px;">${page.wordmark}</div>` : ''}
        <h1 class="bp-hero-title">${page.h1}</h1>
        <p class="bp-hero-sub">${page.intro}</p>

        <ol class="bp-steps">
          ${(page.howToSteps || defaultHowToSteps).map((step, i) => `
          <li class="bp-step">
            <span class="bp-step-num" style="background:${cat.color}20;color:${cat.color};">${i + 1}</span>
            <span>${step}</span>
          </li>`).join('')}
        </ol>

        <a href="#decoder-tool" class="bp-cta-btn" style="background:${cat.color};color:#00382d;">
          <span class="material-symbols-outlined" style="font-size:18px;">bolt</span>
          ${page.primaryCtaLabel || 'Decode Serial Number'}
        </a>
      </div>
    </section>

    <!-- ═══ SUPPORTING INTRO ═══ -->
    <div class="bp-intro-strip">
      <p>${page.supportingIntro}</p>
    </div>

    <!-- ═══ DECODER TOOL ═══ -->
    <section class="bp-tool-section" id="decoder-tool">
      <div class="tool-focus-wrap">
        <div class="seo-tool-shell">
          <div class="home-tools-wrap">
            <div class="home-tools-grid">
              <div class="decoder-card-shell">
                <div class="search-box">
                  <div class="search-tabs">
                    <button class="search-tab cat-tab${page.category === 'appliances' ? ' active' : ''}" data-cat="appliances" onclick="selectCategory('appliances', this)">Appliances</button>
                    <button class="search-tab cat-tab${page.category === 'waterHeaters' ? ' active' : ''}" data-cat="waterHeaters" onclick="selectCategory('waterHeaters', this)">Water Heaters</button>
                    <button class="search-tab cat-tab${page.category === 'hvac' ? ' active' : ''}" data-cat="hvac" onclick="selectCategory('hvac', this)">HVAC</button>
                    <button class="search-tab cat-tab${page.category === 'electronics' ? ' active' : ''}" data-cat="electronics" onclick="selectCategory('electronics', this)">Electronics</button>
                  </div>
                  <div class="search-panel" id="panel-decoder">
                    <!-- Brand Row -->
                    <div class="tool-input-group brand-row">
                      <label for="brand">Select Brand</label>
                      <select id="brand" class="search-select"><option value="">-- Select Brand --</option></select>
                    </div>

                    <!-- Serial Row -->
                    <div class="tool-input-group serial-row">
                      <label class="serial-label" for="serial">${page.inputLabel || 'Enter Serial Number'}</label>
                      <input type="text" id="serial" class="search-input" placeholder="${page.decoderPlaceholder || 'Enter serial number exactly as shown'}">
                    </div>

                    <!-- Era Group -->
                    <div class="era-group hidden" id="eraGroup" style="margin-top: 16px;">
                      <label for="eraSelect">Manufacture Era</label>
                      <select id="eraSelect" class="search-select" style="margin-top: 8px;">
                        <option value="">-- Select Era --</option>
                        <option value="post">Post-2006</option>
                        <option value="pre">Pre-2006</option>
                      </select>
                      <p class="era-note">Some brands reuse serial layouts across decades. Select the era when prompted to improve accuracy.</p>
                    </div>

                    <!-- Helper Text -->
                    <p class="search-hint serial-helper-text" style="margin-top: 16px;">${page.decoderIntro}</p>

                    <!-- Action Button -->
                    <div class="tool-panel-action" style="margin-top: 24px;">
                      <button id="decodeBtn" class="btn-primary power-btn" type="button" disabled onclick="decodeSerial()">${page.actionLabel || 'Decode Serial Number'}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="utility-strip">
          ${trustBullets.map(item => `<span>${item}</span>`).join('')}
        </div>
      </div>
    </section>

    <!-- ═══ RESULTS ═══ -->
    <div class="results-wrapper">
      <div id="ageLoading" class="results-card hidden">
        <div class="loading-inner">
          <span class="loading-emoji lightning" id="loadingEmoji">&#127785;&#65039;</span>
          <div class="loading-text" id="loadingText">Researching product information...</div>
        </div>
      </div>
      <div id="serialResults" class="results-card hidden">
        <div class="results-header">
          <h3>Decoded Results</h3>
          <div class="brand-logo-wrap" id="serialBrandLogo"></div>
        </div>
        <div class="results-body">
          <div id="serialSummaryLayer" class="sl-top-summary-layer serial-summary-layer hidden"></div>
          <div class="serial-legacy-fields" hidden aria-hidden="true">
            <div class="result-row result-row--primary">
              <span class="result-label">Manufacture Date</span>
              <span class="result-value" id="resultYear"></span>
            </div>
            <div class="result-row" id="resultMonthRow">
              <span class="result-label">Month / Period</span>
              <span class="result-value" id="resultMonth"></span>
            </div>
            <div class="result-row">
              <span class="result-label">Brand</span>
              <span class="result-value" id="resultBrand"></span>
            </div>
            <div class="result-row">
              <span class="result-label">Estimated Age</span>
              <span class="result-value" id="resultEstimatedAge">&mdash;</span>
            </div>
            <div class="info-block method"><h4>Decoding Method</h4><p id="resultMethod"></p></div>
            <div class="info-block notes"><h4>Important Notes</h4><p id="resultNotes"></p></div>
            <details class="determination-details">
              <summary>How this was determined</summary>
              <div class="determination-body" id="serialDeterminationBody">
                We use the brand-specific serial rules already supported in Decode My Item. When a brand repeats codes across decades, the result stays estimated until model era or installation context confirms the right cycle.
              </div>
            </details>
          </div>
        </div>
        <div class="results-footer">
          <button class="copy-btn" onclick="copyClaimFile()">Copy Information</button>
          <button class="decode-again-btn btn-amber" onclick="decodeAnotherItem()">Decode Another Item</button>
          <button class="decode-again-btn btn-teal" onclick="window.location.href='/smart-lookup'">Use Smart Lookup</button>
          <button class="error-btn" onclick="openFeedbackModal()">Possible Error?</button>
        </div>
      </div>
    </div>
${renderExtraSections(page.preGridSections)}

    <!-- ═══ CONTENT SECTIONS ═══ -->
    <div class="bp-content-wrap">

      <!-- How to decode + model context (2-col) -->
      <div class="bp-two-col">
        <div class="bp-section-card">
          <div class="bp-section-card-head">
            <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">manage_search</span>
            <h2>${page.decodeSectionTitle}</h2>
          </div>
          <p>${page.decodeSectionBody}</p>
        </div>
        <div class="bp-section-card">
          <div class="bp-section-card-head">
            <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">category</span>
            <h2>${page.modelSectionTitle}</h2>
          </div>
          <p>${page.modelSectionBody}</p>
        </div>
      </div>

      <!-- Serial format cards -->
      <div class="bp-section-card bp-full-width">
        <div class="bp-section-card-head">
          <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">barcode_scanner</span>
          <h2>${page.formatSectionTitle}</h2>
        </div>
        <div class="fmt-cards-grid">
          ${renderFormatCards(page.formats)}
        </div>
      </div>

      ${page.examples && page.examples.length ? `<!-- Examples -->
      <div class="bp-section-card bp-full-width">
        <div class="bp-section-card-head">
          <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">terminal</span>
          <h2>${page.exampleSectionTitle}</h2>
        </div>
        <div class="ex-terminals-grid">
          ${renderExampleTerminals(page.examples)}
        </div>
      </div>` : ''}

      <!-- Location guide -->
      <div class="bp-section-card bp-full-width">
        <div class="bp-section-card-head">
          <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">pin_drop</span>
          <h2>${page.locationSectionTitle}</h2>
        </div>
        <div class="loc-cards-grid">
          ${renderLocationIconCards(page.locations)}
        </div>
      </div>

      <!-- Troubleshooting + FAQ (2-col) -->
      <div class="bp-two-col">
        <div class="bp-section-card">
          <div class="bp-section-card-head">
            <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">troubleshoot</span>
            <h2>${page.problemSectionTitle}</h2>
          </div>
          <ul class="bp-check-list">
            ${renderBulletChecklist(page.problems)}
          </ul>
        </div>
        <div class="bp-section-card">
          <div class="bp-section-card-head">
            <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">help</span>
            <h2>FAQ</h2>
          </div>
          <div class="bp-faq-list">
            ${renderFaqAccordion(page.faqs)}
          </div>
        </div>
      </div>

      <!-- Related links -->
      <div class="bp-section-card bp-full-width">
        <div class="bp-section-card-head">
          <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">link</span>
          <h2>${page.relatedSectionTitle || 'Related Decoder Pages'}</h2>
        </div>
        <div class="bp-pills-wrap">
          ${renderRelatedPills(page.relatedLinks)}
        </div>
      </div>

      <!-- Research paths -->
      <div class="bp-section-card bp-full-width">
        <div class="bp-section-card-head">
          <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">explore</span>
          <h2>Research Paths</h2>
        </div>
        <div class="link-group-grid">${renderLinkGroupCards(page.linkGroups)}</div>
      </div>

      <!-- Bottom CTA -->
      <div class="bp-cta-card">
        <span class="material-symbols-outlined" style="font-size:40px;color:${cat.color};margin-bottom:12px;">description</span>
        <h2>${page.bottomCtaTitle || 'Need a claim-ready replacement summary?'}</h2>
        <p>${page.bottomCtaBody || 'Use the decoder above to start, or try Smart Lookup if the serial label is worn or missing.'}</p>
        <div class="bp-cta-row">
          <a href="#decoder-tool" class="bp-cta-btn" style="background:${cat.color};color:#00382d;">
            <span class="material-symbols-outlined" style="font-size:16px;">bolt</span> ${page.bottomPrimaryLabel || 'Decode a Serial'}
          </a>
          <a href="/smart-lookup" class="bp-cta-btn-outline" style="border-color:${cat.color}40;color:${cat.color};">
            Try Smart Lookup →
          </a>
        </div>
      </div>

    </div>

    ${renderExtraSections(page.postGridSections)}

  </main>

  <!-- ═══ FEEDBACK MODAL ═══ -->
  <div id="feedbackModal" class="modal-overlay hidden" onclick="if(event.target===this)closeFeedbackModal()">
    <div class="modal-card">
      <div class="modal-header">
        <h3>Report an Issue</h3>
        <button class="modal-close" onclick="closeFeedbackModal()">&#x2715;</button>
      </div>
      <div class="modal-body">
        <div class="modal-field"><label class="sr-only" for="fbBrand">Brand</label><input type="text" id="fbBrand" class="form-input" readonly></div>
        <div class="modal-field"><label class="sr-only" for="fbSerial">Serial Number</label><input type="text" id="fbSerial" class="form-input" readonly></div>
        <div class="modal-field">
          <label class="sr-only" for="fbType">Issue Type</label>
          <select id="fbType" class="form-select">
            <option value="">-- Select issue type --</option>
            <option value="wrong_year">Wrong year / date</option>
            <option value="wrong_month">Wrong month</option>
            <option value="wrong_brand">Wrong brand identified</option>
            <option value="format_error">Format / decode error</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="modal-field"><label class="sr-only" for="fbDetails">Details</label><textarea id="fbDetails" class="form-input" rows="3" placeholder="What seems wrong?"></textarea></div>
        <div id="fbThanks" class="fb-thanks hidden">Thank you. Your feedback helps improve the decoder.</div>
        <div id="fbActions" class="modal-actions">
          <button class="decode-btn" onclick="submitFeedback()">Submit Feedback</button>
          <button class="cancel-btn" onclick="closeFeedbackModal()">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ═══ FOOTER ═══ -->
  <footer class="footer-sitemap">
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
        <li><a href="/rheem-serial-number-lookup">Rheem HVAC</a></li>
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
        ${footerResources.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('\n        ')}
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
  </footer>

  <script>
    function selectCatAndShowDecoder(cat, btn) {
      if (typeof selectCategory === 'function') selectCategory(cat, btn);
    }
    function applySeoBrandSelection(attempt) {${preselectScript}
    }
    window.addEventListener('DOMContentLoaded', function() {
      var activeTab = document.querySelector('[data-cat="${page.category}"]');
      if (activeTab) selectCatAndShowDecoder('${page.category}', activeTab);
      applySeoBrandSelection(0);
    });
    window.addEventListener('pageshow', function () {
      var feedbackModal = document.getElementById('feedbackModal');
      var navList = document.querySelector('nav ul');
      var hamburger = document.getElementById('hamburgerBtn');
      if (!feedbackModal || feedbackModal.classList.contains('hidden')) { document.body.style.overflow = ''; }
      document.body.classList.remove('nav-menu-open');
      if (navList) navList.classList.remove('open');
      if (hamburger) hamburger.classList.remove('active');
    });
    // FAQ accordion icon rotation
    document.querySelectorAll('.bp-faq-item').forEach(el => {
      el.addEventListener('toggle', () => {
        el.querySelector('.bp-faq-icon').style.transform = el.open ? 'rotate(180deg)' : '';
      });
    });
  </script>
  <script defer src="decoder-data.js"></script>
  <script defer src="lkq-engine.js"></script>
  <script defer src="analytics.js"></script>
  <script defer src="smart-lookup-bundle.js"></script>
  <script defer src="script.js"></script>
  <script defer src="responsive-navigation.js"></script>
  <script defer src="/serial-refinement-controller.js"></script>
  ${page.pageScript ? `<script>${page.pageScript}</script>` : ''}
  ${schema.map(scriptJson).join('\n  ')}
</body>
</html>
`;
}



function baseLinkGroups() {
  return [
    { title: 'Appliance Age Lookup', links: [['how-old-is-my-appliance', 'How Old Is My Appliance?'], ['serial-number-location-guide', 'Where Is My Serial Number?'], ['appliance-age-for-insurance-and-replacement', 'Insurance, Repair & Replacement'], ['find-model-serial-number', 'Find Model & Serial Labels']] },
    { title: 'Popular Appliance Brands', links: applianceBrandLinks.slice(0, 8) },
    { title: 'Appliance Type Lookups', links: applianceTypeLinks.slice(1, 6) },
    { title: 'HVAC Age Lookup', links: hvacLinks },
    { title: 'Electronics Serial & Model Lookup', links: electronicsLinks }
  ];
}

function electronicsLinkGroups() {
  return [
    { title: 'Electronics Research', links: [['how-old-is-my-electronics', 'Electronics Age Guide'], ['find-model-serial-number', 'Find Model & Serial Labels'], ['smart-lookup', 'Smart Lookup'], ['methodology', 'Methodology']] },
    { title: 'Supported Electronics Paths', links: electronicsLinks.slice(0, 7) },
    { title: 'Product History', links: [['tv-history', 'TV History'], ['computer-history', 'Computer History']] }
  ];
}

const pages = [
  {
    slug: 'appliance-age-for-insurance-and-replacement',
    title: 'Why Appliance Age Matters for Insurance, Repair & Replacement',
    description: 'Learn why appliance age verification matters for insurance claims, repair decisions, replacement research, depreciation, and technician documentation.',
    htmlTitleOverride: 'Appliance Age for Insurance Claims & Replacement | Decode My Item',
    metaDescriptionOverride: 'Learn how to determine appliance age using serial numbers for insurance claims, depreciation calculations, and replacement decisions. Works for all major appliance brands.',
    h1: 'Why Appliance Age Matters for Insurance, Repair & Replacement',
    badge: 'Documentation workflow guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Appliance age is often part of repair, replacement, depreciation, parts-availability, and documentation workflows long before anyone makes a final decision.',
    supportingIntro: 'Start by checking the brand, model, and serial number. This page explains why age verification can be useful for claim files, service decisions, technician research, and replacement planning without turning a date estimate into legal or coverage advice.',
    decoderIntro: 'Start by checking the brand, model, and serial number.',
    decoderPlaceholder: 'Enter serial number for age research',
    howToSteps: [
      'Identify the brand on the product label.',
      'Capture the model number and serial number exactly as shown.',
      'Decode the date pattern, then cross-check it with the label, invoice, manual, or manufacturer resources when needed.'
    ],
    preGridSections: [
      {
        type: 'ordered-list',
        title: 'How item age is usually verified',
        items: [
          'Identify the brand.',
          'Locate the model number.',
          'Locate the serial number.',
          'Decode the date pattern when a supported serial format is available.',
          'Cross-check the result with the label, manual, invoice, or manufacturer resources for higher-stakes decisions.'
        ]
      }
    ],
    decodeSectionTitle: 'Why age verification matters',
    decodeSectionBody: 'Age can be useful for repair-versus-replace decisions, parts availability, replacement compatibility, claim documentation, and depreciation context. It is usually one of the first facts a homeowner, adjuster, or technician tries to confirm after the brand and model are known.',
    modelSectionTitle: 'For insurance adjusters',
    modelSectionBody: 'Serial-based age research may help support documentation, estimate depreciation context, compare a damaged item to current equivalent models, and reduce unclear claim notes. It does not provide legal, policy, or coverage advice, and manufacturer confirmation may still be needed for high-stakes files.',
    formatSectionTitle: 'Common limitations to keep in mind',
    formats: [
      { label: 'Repeating year codes', pattern: 'Many brands reuse letters or digits by decade', meaning: 'An age result may stay estimated until model era or install context narrows it.', confidence: 'Common limitation.' },
      { label: 'Private-label brands', pattern: 'OEM may differ from the retail badge', meaning: 'The model prefix may be needed before the serial can route correctly.', confidence: 'Common with Kenmore and similar brands.' },
      { label: 'Partial or damaged labels', pattern: 'Missing opening characters or factory block', meaning: 'The strongest date positions may be gone, forcing a broader estimate.', confidence: 'Common field issue.' },
      { label: 'High-stakes files', pattern: 'Insurance, legal, or warranty disputes', meaning: 'Manufacturer confirmation or supporting paperwork may still be needed.', confidence: 'Use caution.' }
    ],
    exampleSectionTitle: 'Age verification can be useful for these workflows',
    examples: [
      { label: 'Replacement research', serial: 'Age + model family', note: 'Age and model family together can help narrow a comparable replacement path when the exact product is discontinued.' },
      { label: 'Repair vs replace', serial: 'Age + parts availability', note: 'Technicians and owners often use age alongside visible condition, labor cost, and part availability rather than as a stand-alone decision.' },
      { label: 'Claim documentation', serial: 'Age + label photo', note: 'A saved photo of the label plus the estimated age can make the file clearer when the product will be removed or discarded.' }
    ],
    locationSectionTitle: 'Common items where age matters most',
    locations: [
      { title: 'Major appliances', items: ['<a href="/refrigerator-serial-number">Refrigerators</a>', '<a href="/washer-serial-number">Washers</a>', '<a href="/dryer-serial-number">Dryers</a>', '<a href="/dishwasher-serial-number">Dishwashers</a>', '<a href="/range-oven-serial-number">Ranges & ovens</a>'] },
      { title: 'HVAC equipment', items: ['<a href="/carrier-serial-number-lookup">Carrier</a>', '<a href="/trane-serial-number-lookup">Trane</a>', '<a href="/rheem-serial-number-lookup">Rheem</a>', '<a href="/goodman-serial-number-lookup">Goodman</a>', '<a href="/hvac-age-by-serial-number">HVAC age lookup</a>'] },
      { title: 'Support and replacement workflow', items: ['<a href="/how-old-is-my-appliance">How old is my appliance?</a>', '<a href="/serial-number-location-guide">Where is my serial number?</a>', '<a href="/replacement-lookup">Replacement lookup</a>', 'Use Smart Lookup when the label is partial or missing'] }
    ],
    problemSectionTitle: 'Appliance age vs condition',
    problems: [
      'Age is only one factor. Maintenance history, usage, environment, and visible damage still matter.',
      'Parts availability can make a newer product harder to repair than an older one with stronger support.',
      'Comparable replacement cost can matter more than age alone in research and documentation workflows.',
      'A well-maintained product may outlast average expectations, while a poorly maintained unit may fail early.',
      'Technician notes should separate age estimates from condition findings and repairability conclusions.'
    ],
    postGridSections: [
      {
        type: 'copy-block',
        title: 'For homeowners and consumers',
        body: [
          'Age verification can be useful for deciding whether a repair still makes sense, checking where a product sits in or out of its likely warranty period, preparing for a service call, and narrowing replacement options before spending time on model research.',
          'The most practical workflow is usually to capture the label first, estimate the age second, and only then compare condition, repair cost, and replacement options.'
        ]
      },
      {
        type: 'copy-block',
        title: 'For technicians and contractors',
        body: [
          'Technicians often use serial numbers to confirm equipment generation, support parts lookup, check model-family compatibility, and document why a product belongs in one repair or replacement path rather than another.',
          'That does not make serial decoding exact in every case. Results may vary by brand, product line, and whether the manufacturer repeats code cycles.'
        ]
      },
      {
        type: 'copy-block',
        title: 'Limitations',
        body: [
          'Serial formats vary by manufacturer and product line. Private-label brands can be harder because the retail badge does not always match the true OEM path.',
          'Codes can repeat by decade, labels can be damaged, and some results stay estimated until they are cross-checked against the model family, paperwork, or manufacturer resources.',
          'For insurance, warranty, legal, or other high-stakes decisions, manufacturer confirmation may still be needed.'
        ]
      }
    ],
    faqs: [
      ['Can appliance age affect insurance claim documentation?', 'Yes. It may help support documentation, depreciation context, and replacement research, but it does not determine coverage or guarantee a claim outcome.'],
      ['Is serial number decoding always exact?', 'No. Some brands repeat codes across decades or vary by product line, so the result may stay estimated until more context is available.'],
      ['What is LKQ replacement research?', 'It is research used to find a like-kind and quality replacement path when the original product is damaged, discontinued, or no longer practical to repair.'],
      ['What is ACV depreciation?', 'Actual cash value depreciation is a context term often used in claims to describe value after age and condition are considered. This site does not provide legal or policy advice.'],
      ['Should age be the only factor in replacement?', 'No. Condition, maintenance, parts availability, comparable replacement cost, and safety or performance concerns all matter too.'],
      ['Can technicians use serial numbers for parts research?', 'Yes. The serial and model together can be useful for identifying the right generation, parts family, and replacement compatibility path.'],
      ['What should I do if the decoder cannot confirm the age?', 'Keep the result marked as estimated, cross-check the model family and paperwork, and seek manufacturer confirmation if the decision is high-stakes.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
          ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['washer-serial-number', 'Washer Serial Number Lookup'],
      ['dishwasher-serial-number', 'Dishwasher Serial Number Lookup'],
      ['carrier-serial-number-lookup', 'Carrier'],
      ['rheem-serial-number-lookup', 'Rheem']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'refrigerator-serial-number',
    title: 'Refrigerator Serial Number and Label Guide',
    description: 'Find a refrigerator model and serial label, identify the manufacturer path, and interpret supported brand formats without assuming one universal date code.',
    h1: 'Refrigerator Serial Number and Label Guide',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Find the refrigerator label first, then choose the actual manufacturer path. Refrigerator serial formats are brand-specific, so the product type alone cannot determine a manufacture date.',
    supportingIntro: 'This page is a refrigerator label and routing guide. It compares supported brand formats, explains private-label OEM cases, and shows when a model number can narrow a repeating serial-year cycle.',
    primaryCtaLabel: 'Choose Brand and Decode',
    decoderIntro: 'Use the refrigerator brand and serial number exactly as shown on the label.',
    decoderPlaceholder: 'Enter refrigerator serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'A refrigerator serial number is only meaningful after the manufacturer is known. Supported Whirlpool, GE, LG, Samsung, Frigidaire, Bosch, and OEM-routed Kenmore paths use different positions and return different levels of precision.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number identifies the refrigerator family and may expose the original manufacturer on a private-label unit. It can also narrow an ambiguous serial cycle when the repository has matching model-era evidence.',
    preGridSections: [
      {
        type: 'copy-block',
        id: 'refrigerator-brand-first',
        title: 'Why refrigerator decoding starts with the brand',
        body: [
          'There is no refrigerator-wide date code. A Whirlpool-family serial can encode a repeating year letter and production week, while LG commonly uses an opening year digit and two-digit month. Frigidaire adds factory letters before its year and week positions, and Kenmore may need a model prefix before the correct OEM decoder is known.',
          'Photograph both the model and serial fields before moving drawers or replacing an interior label. If the decoder returns several candidate years, use model-era evidence or Smart Lookup rather than choosing the newest year by assumption.'
        ]
      },
      {
        type: 'table',
        id: 'refrigerator-verified-examples',
        title: 'Verified refrigerator examples',
        intro: 'These sanitized examples are tied to current regression fixtures and show why model context matters.',
        rows: [
          { field: 'Frigidaire BA10515647', meaning: 'Year digit 1; production week 05', why: 'Serial alone allows 1991, 2001, 2011, or 2021. Model FFTR2045VS0 narrows the tested result to week 05 of 2021.' },
          { field: 'Kenmore model prefix 795 + LG serial 410KR00219', meaning: '795 routes to LG; opening 4 + 10', why: 'The route returns October with candidate years 2004, 2014, or 2024 until model-era evidence selects a decade.' }
        ]
      }
    ],
    formatSectionTitle: 'Common refrigerator serial number formats',
    formats: [
      { label: 'Whirlpool-family refrigerators', pattern: '9 or 10 characters', meaning: 'Year code position changes by serial length, followed by a production week.', confidence: 'Estimated decade. Whirlpool cycles repeat.' },
      { label: 'GE-family refrigerators', pattern: 'Opening month/year letters', meaning: 'The first letters usually carry the useful timing code.', confidence: 'Estimated decade. GE cycles repeat.' },
      { label: 'LG refrigerators', pattern: 'Year digit + month digits', meaning: 'Character 1 is commonly the year digit and characters 2-3 are commonly the month.', confidence: 'Estimated decade. Use model era if needed.' },
      { label: 'Samsung refrigerators', pattern: '11-char or 15-char serial', meaning: 'Year and month positions depend on serial length.', confidence: 'Estimated if the year letter repeats.' },
      { label: 'Kenmore refrigerators', pattern: 'OEM-dependent', meaning: 'The model prefix may route the serial into Whirlpool, GE, LG, or another supported OEM pattern.', confidence: 'Estimated until the OEM is confirmed.' }
    ],
    exampleSectionTitle: 'Refrigerator serial number examples',
    examples: [
      { label: 'Frigidaire refrigerator with model context', serial: 'BA10515647 + FFTR2045VS0', note: 'The tested serial/model pair resolves to week 05 of 2021. Without the model, the serial year digit remains decade-ambiguous.' },
      { label: 'Kenmore refrigerator routed to LG', serial: '795.74053.410 + 410KR00219', note: 'The 795 model prefix selects LG logic. The serial returns October and the candidate years 2004, 2014, or 2024.' }
    ],
    locationSectionTitle: 'Where to find the serial number',
    locations: [
      { title: 'Inside the fresh-food compartment', items: ['Check the left or right side wall first', 'Look behind the crisper drawers on bottom-freezer designs'] },
      { title: 'Interior trim areas', items: ['Some brands place the tag on the ceiling liner', 'Others place it near the deli drawer or lower frame opening'] },
      { title: 'Fallback spots', items: ['Rear service label or kick plate on some units', 'Original paperwork or registration card if the interior tag is unreadable'] }
    ],
    problemSectionTitle: 'Common problems',
    problems: [
      'The label is hidden behind produce drawers or trim pieces.',
      'The brand is known, but the refrigerator is a private-label or Kenmore OEM build.',
      'The serial number is readable but the year code repeats across decades.',
      'Only the model number is available after a repaint or interior liner replacement.',
      'The refrigerator family has multiple product lines that use different serial layouts.'
    ],
    faqs: [
      ['Do all refrigerator brands use the same serial date format?', 'No. Select the manufacturer before interpreting any positions. Product type alone does not determine the serial rule.'],
      ['Why does a Kenmore refrigerator need its model prefix?', 'Kenmore is a private-label brand. The prefix can identify the OEM family whose serial logic should be used.'],
      ['Can a refrigerator model number resolve the decade?', 'Sometimes. It can narrow a repeating serial cycle only when reliable model-era evidence overlaps one candidate year.'],
      ['Where should I look on a French-door refrigerator?', 'Start on the interior side walls of the fresh-food compartment, then check behind lower drawers and interior trim. Manufacturer guidance differs by model.'],
      ['Why did the decoder return several possible years?', 'Some brands reuse year codes. Keep every candidate until the model generation, installation record, or another reliable source resolves the cycle.'],
      ['What should I do when the interior label is unreadable?', 'Check registration records, manuals, purchase documents, or Smart Lookup with the model number. Do not reconstruct missing serial characters.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Refrigerator Age Path'],
      ['ge-serial-number-lookup', 'GE Refrigerator Age Path'],
      ['lg-serial-number-lookup', 'LG Refrigerator Age Path'],
      ['frigidaire-serial-number-lookup', 'Frigidaire Refrigerator Age Path'],
      ['find-model-serial-number', 'Find Model & Serial Labels'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'washer-serial-number',
    title: 'Washer Model and Serial Number Label Guide',
    description: 'Find top-load and front-load washer labels, choose the correct manufacturer decoder, and understand when a repeating serial code needs model-era evidence.',
    h1: 'Washer Model and Serial Number Label Guide',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Locate the washer label, identify the manufacturer, and then use that brand\'s supported serial path. Top-load and front-load washers do not share one universal date format.',
    supportingIntro: 'This guide separates physical label recovery from date interpretation. The serial usually carries the age code, while the model identifies the platform and can help resolve an OEM or decade question.',
    primaryCtaLabel: 'Choose Washer Brand',
    decoderIntro: 'Select the washer brand and enter the serial exactly as shown.',
    decoderPlaceholder: 'Enter washer serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'After the washer brand is selected, supported paths may return a production week, month, or repeating set of candidate years. A result is not exact when the manufacturer reuses its year code.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number distinguishes washer platform and OEM. It is especially important for Kenmore routing, Maytag pre/post-2006 logic, and model-assisted narrowing of an LG or Whirlpool-family year cycle.',
    preGridSections: [
      {
        type: 'copy-block',
        id: 'washer-load-style',
        title: 'Top-load and front-load labels are not in the same place',
        body: [
          'For a top-load washer, inspect the underside of the lid, the tub rim, the rear control area, and the upper side panels. For a front-load washer, open the door and inspect the cabinet rim around the drum opening before checking the rear panel.',
          'Record the model and serial as separate fields. An LG model normally begins with a letter, while the supported LG appliance serial path begins with the numeric year/month group. Mixing those identifiers produces an unsupported result.'
        ]
      },
      {
        type: 'table',
        id: 'washer-verified-example',
        title: 'Verified washer example',
        intro: 'The regression fixture below demonstrates a serial cycle that becomes useful only when the washer model is also available.',
        rows: [
          { field: 'LG 412TATG1H105', meaning: 'Opening 4 = candidate year; 12 = December', why: 'Serial-only candidates are 2004, 2014, or 2024. Model WM3470HWA narrows the tested result to December 2014.' },
          { field: 'LG model WM3470HWA', meaning: 'Front-load washer family context', why: 'The model is supporting evidence for the decade; it is not substituted into the serial decoder.' }
        ]
      }
    ],
    formatSectionTitle: 'Common washer serial number formats',
    formats: [
      { label: 'Whirlpool / Maytag post-2006', pattern: '9 or 10 characters with year code + week', meaning: 'Many modern Whirlpool-family washers store the year code early in the serial and follow it with week digits.', confidence: 'Estimated decade. Use era or model clues if needed.' },
      { label: 'GE washers', pattern: 'Opening letters for month and year', meaning: 'The first two serial letters are usually the useful timing positions.', confidence: 'Estimated decade. GE cycles repeat.' },
      { label: 'LG washers', pattern: 'Year digit + 2-digit month', meaning: 'The opening three characters usually hold the age signal.', confidence: 'Estimated decade.' },
      { label: 'Samsung washers', pattern: '11-char or 15-char serial', meaning: 'Year and month positions change by serial length.', confidence: 'Estimated when year codes repeat.' },
      { label: 'Kenmore washers', pattern: 'OEM-dependent by model prefix', meaning: 'The model prefix often decides whether the washer follows Whirlpool, GE, LG, or Frigidaire logic.', confidence: 'Estimated until OEM is confirmed.' }
    ],
    exampleSectionTitle: 'Washer serial number examples',
    examples: [
      { label: 'LG washer with model-assisted decade', serial: '412TATG1H105 + WM3470HWA', note: 'The tested serial returns December and three candidate years. The washer model narrows that cycle to 2014.' }
    ],
    locationSectionTitle: 'Where to find the serial number',
    locations: [
      { title: 'Top-load washers', items: ['Under the lid or around the opening rim', 'Rear console or back panel on some brands'] },
      { title: 'Front-load washers', items: ['Door opening or frame edge', 'Back panel or lower service area if the front tag is missing'] },
      { title: 'Documentation fallback', items: ['Owner manual or purchase paperwork', 'Registration records when the label is worn'] }
    ],
    problemSectionTitle: 'Common problems',
    problems: [
      'Top-load and front-load labels are in different places on the same brand family.',
      'The serial result is decade-ambiguous because the manufacturer repeats year codes.',
      'Only the model number is available after a control-panel or cabinet replacement.',
      'A Kenmore washer needs the model prefix first before the serial can route to the right OEM.',
      'A laundry center or stacked unit hides the tag near the opening or rear panel.'
    ],
    faqs: [
      ['Where is the label on a front-load washer?', 'Open the door and inspect the cabinet rim around the drum opening. If it is not there, check the rear panel or the manufacturer\'s model-specific guide.'],
      ['Where is the label on a top-load washer?', 'Check beneath the lid, around the tub opening, behind the control panel, and on the upper side or rear cabinet.'],
      ['Why do I need both model and serial for a Kenmore washer?', 'The model prefix can identify the original manufacturer; the serial is then interpreted with that OEM family\'s rule.'],
      ['How does Maytag washer era affect the result?', 'Pre-2006 Maytag and post-2006 Whirlpool-family paths differ. If the era is unknown, keep both supported results instead of forcing one.'],
      ['Can an LG washer serial return more than one year?', 'Yes. The leading year digit repeats by decade. A verified model family may narrow the candidates, but the serial alone cannot.'],
      ['Should I enter the washer model into the serial field?', 'No. Keep the identifiers separate. Use the serial field for the label serial and the model field for model-era or OEM context.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Washer Path'],
      ['maytag-serial-number-lookup', 'Maytag Washer Path'],
      ['samsung-serial-number-lookup', 'Samsung Washer Path'],
      ['lg-serial-number-lookup', 'LG Washer Path'],
      ['kenmore-serial-number-lookup', 'Kenmore Washer Path'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'dryer-serial-number',
    title: 'Dryer Model and Serial Number Label Guide',
    description: 'Find dryer labels by configuration, identify the manufacturer path, and understand when a serial can support an age estimate without inventing a universal dryer code.',
    h1: 'Dryer Model and Serial Number Label Guide',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Start with the dryer\'s model-and-serial label and actual manufacturer. Gas, electric, stacked, and ventless dryers use different label locations, while date-code positions remain brand-specific.',
    supportingIntro: 'This page does not apply one serial rule to every dryer. It helps locate the label, choose the correct brand decoder, and recognize when a repeating code or private-label OEM still needs model context.',
    primaryCtaLabel: 'Choose Dryer Brand',
    decoderIntro: 'Select the dryer brand and enter the serial number exactly as shown.',
    decoderPlaceholder: 'Enter dryer serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'Supported brand paths can return a year cycle, production week, or month. The decoder must know whether the dryer is Whirlpool-family, Maytag legacy, GE, LG, Samsung, or another supported manufacturer before positions are interpreted.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model identifies the dryer family, configuration, and sometimes the private-label OEM. It can support decade research, but it is not a substitute for a missing serial date code.',
    preGridSections: [
      {
        type: 'copy-block',
        id: 'dryer-label-by-configuration',
        title: 'Dryer configuration changes the search path',
        body: [
          'Open the dryer door and inspect the rim and cabinet edge first. On some gas dryers the identifying plate is behind an access panel; ventless models may place it near or behind the water tank; stacked laundry products often use the inside of the dryer door.',
          'No dryer-specific serial fixture can represent every manufacturer. This guide therefore does not publish a fabricated cross-brand worked example. Choose the brand and use a verified brand page for the actual code positions.'
        ]
      },
      {
        type: 'ordered-list',
        id: 'dryer-identification-order',
        title: 'A defensible dryer identification order',
        intro: 'Keep the physical and decoding steps separate.',
        items: [
          'Photograph the entire label, including brand, model, serial, fuel type, and electrical data.',
          'Confirm whether the product is a standalone dryer, laundry center, stacked pair, or all-in-one unit.',
          'Select the manufacturer path and preserve every candidate year returned by a repeating code.',
          'Use the model family, installation record, or Smart Lookup only to narrow candidates with supporting evidence.'
        ]
      }
    ],
    formatSectionTitle: 'Common dryer serial number formats',
    formats: [
      { label: 'Whirlpool-family dryers', pattern: '9 or 10 characters with year code + week', meaning: 'The year code usually sits in position 2 or 3 depending on total serial length.', confidence: 'Estimated decade. Whirlpool cycles repeat.' },
      { label: 'Maytag dryers', pattern: 'Legacy and Whirlpool-era paths', meaning: 'Older Maytag dryers use a different pattern than newer Whirlpool-era Maytag products.', confidence: 'Estimated until the era is confirmed.' },
      { label: 'GE dryers', pattern: 'Month letter + year letter opening', meaning: 'The first letters are usually the meaningful timing positions.', confidence: 'Estimated decade.' },
      { label: 'LG dryers', pattern: 'Year digit + month digits', meaning: 'The opening three characters usually drive the age estimate.', confidence: 'Estimated decade.' },
      { label: 'Samsung dryers', pattern: '11-char or 15-char serial', meaning: 'Year and month positions depend on serial length.', confidence: 'Estimated when repeated year codes appear.' }
    ],
    exampleSectionTitle: 'Dryer serial number examples',
    examples: [],
    locationSectionTitle: 'Where to find the serial number',
    locations: [
      { title: 'Door opening labels', items: ['Around the dryer door rim on many front-load and standard dryers', 'Check the cabinet edge if the tag is not visible at first glance'] },
      { title: 'Rear and service labels', items: ['Back panel on some electric and gas dryers', 'Bulkhead or lower frame on certain stacked units'] },
      { title: 'Older product fallback', items: ['Original paperwork or owner manual', 'Registration records if the physical tag is worn'] }
    ],
    problemSectionTitle: 'Common problems',
    problems: [
      'The door opening label is hidden by lint or cabinet repainting.',
      'Gas and electric versions share a model family but not always the same service history.',
      'The serial result is still estimated because the year code repeats.',
      'A stacked laundry unit hides the dryer tag deeper in the cabinet opening.',
      'A private-label dryer needs the model prefix first to identify the OEM path.'
    ],
    faqs: [
      ['Where should I look first on a standalone dryer?', 'Open the door and inspect the rim, cabinet edge, and inside face of the door before checking the rear cabinet.'],
      ['Does a gas dryer have a different label location?', 'It can. Some gas models place identifying information behind a lower access panel in addition to the door or rear-cabinet label.'],
      ['Why is there no universal dryer serial example?', 'Manufacturers use different positions and cycles. A cross-brand example would imply a rule that does not exist.'],
      ['How do I research a stacked laundry unit?', 'Check the inside of the dryer door and the washer opening, then record which serial belongs to each component.'],
      ['Can the dryer model number determine manufacture date?', 'Usually not by itself. It identifies configuration and family and may help narrow a serial-year cycle when reliable era evidence exists.'],
      ['What should I do with an unreadable door label?', 'Check the original registration, manual, sales record, or rear/service label, then use Smart Lookup with the model number if the serial remains unavailable.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Dryer Path'],
      ['maytag-serial-number-lookup', 'Maytag Dryer Path'],
      ['ge-serial-number-lookup', 'GE Dryer Path'],
      ['lg-serial-number-lookup', 'LG Dryer Path'],
      ['samsung-serial-number-lookup', 'Samsung Dryer Path'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'dishwasher-serial-number',
    title: 'Dishwasher Model and Serial Number Label Guide',
    description: 'Find a dishwasher label on the door or tub, choose the manufacturer decoder, and compare supported FD, year-week, and month-year formats honestly.',
    h1: 'Dishwasher Model and Serial Number Label Guide',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Open the dishwasher door to find the model-and-serial plate, then select the actual manufacturer. Bosch FD numbers, Whirlpool-family year/week codes, and Frigidaire factory/year/week strings are not interchangeable.',
    supportingIntro: 'This page is designed for label recovery and brand routing. Panel-ready, drawer, and standard built-in dishwashers can hide identifiers in different places, and private-label products may need OEM identification before decoding.',
    primaryCtaLabel: 'Choose Dishwasher Brand',
    decoderIntro: 'Select the dishwasher brand and enter the serial exactly as printed.',
    decoderPlaceholder: 'Enter dishwasher serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'Supported dishwasher paths return different outputs: Bosch FD can yield year and month, Whirlpool-family and Frigidaire formats often return a production week plus a repeating year cycle, and other brands use their own positions.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model identifies the dishwasher family and may expose the OEM behind a Kenmore or private-label product. It can provide era context but should never be inserted into the serial field.',
    preGridSections: [
      {
        type: 'copy-block',
        id: 'dishwasher-open-door-labels',
        title: 'Why the door must be open for a complete label check',
        body: [
          'Standard built-in dishwashers commonly place the label on the tub frame, inner door edge, or upper lip. Drawer units may use the side of the top drawer, while panel-ready trim can hide the plate near a hinge or side edge.',
          'Capture the full label before closing the door. An FD field, model prefix, and serial number can serve different purposes, so treating every printed identifier as the serial can route the unit incorrectly.'
        ]
      },
      {
        type: 'table',
        id: 'dishwasher-verified-examples',
        title: 'Verified dishwasher-format examples',
        intro: 'These fixtures exercise current brand decoders; apply them only after the dishwasher manufacturer is confirmed.',
        rows: [
          { field: 'Bosch FD8605123456', meaning: 'FD 86 + month 05', why: 'The tested Bosch-family path resolves to May 2006.' },
          { field: 'Whirlpool-family C21435678', meaning: 'Year code 2 + week 14', why: 'The tested nine-character path returns week 14 and a repeating Whirlpool-family year cycle rather than one assumed decade.' }
        ]
      }
    ],
    formatSectionTitle: 'Common dishwasher serial number formats',
    formats: [
      { label: 'Bosch-family dishwashers', pattern: 'FD code', meaning: 'The FD digits usually map directly to production year and month.', confidence: 'Higher confidence when FD is present.' },
      { label: 'Whirlpool-family dishwashers', pattern: '9 or 10 characters with year code + week', meaning: 'The year code position changes with serial length and is followed by week digits.', confidence: 'Estimated decade.' },
      { label: 'GE dishwashers', pattern: 'Opening month/year letters', meaning: 'The first letters usually carry the age logic.', confidence: 'Estimated decade.' },
      { label: 'Frigidaire dishwashers', pattern: 'Factory letters + year/week digits', meaning: 'The first numeric digit after the factory code often indicates year, followed by week digits.', confidence: 'Estimated decade.' },
      { label: 'Samsung / LG dishwashers', pattern: 'Brand-specific month/year positions', meaning: 'Samsung uses serial-length-dependent positions. LG uses an opening year digit plus month digits.', confidence: 'Estimated decade.' }
    ],
    exampleSectionTitle: 'Dishwasher serial number examples',
    examples: [
      { label: 'Bosch-family FD fixture', serial: 'FD8605123456', note: 'The current Bosch-family regression resolves FD 86 and month 05 to May 2006.' },
      { label: 'Whirlpool-family week fixture', serial: 'C21435678', note: 'The nine-character fixture reads year code 2 and production week 14. The year code still repeats by cycle.' }
    ],
    locationSectionTitle: 'Where to find the serial number',
    locations: [
      { title: 'Open-door frame labels', items: ['Upper inner door frame on many dishwashers', 'Tub lip or side edge near the hinges on others'] },
      { title: 'Side trim and hinge areas', items: ['Check the side edge if the top frame is clean', 'Look near the hinge area on drawer and panel-ready designs'] },
      { title: 'Documentation fallback', items: ['Installation paperwork when the door tag is worn', 'Original purchase record or service invoice'] }
    ],
    problemSectionTitle: 'Common problems',
    problems: [
      'The dishwasher label is only visible when the door is fully open.',
      'Panel-ready or drawer dishwashers can hide the tag near the hinge or trim edge.',
      'The serial result still needs model-era context because the year code repeats.',
      'The dishwasher is a private-label brand and needs OEM identification first.',
      'Only the model number is available from paperwork or a service invoice.'
    ],
    faqs: [
      ['Is a Bosch FD number the same as the serial number?', 'It is a separate production field on Bosch-family rating plates. Use the FD path only when that field is actually present.'],
      ['Where is the label on a built-in dishwasher?', 'Open the door and inspect the tub frame, inner door edge, upper lip, and hinge-side trim.'],
      ['Where is the label on a drawer dishwasher?', 'Check the side of the upper drawer and the frame exposed when the drawer is open.'],
      ['Why does a Kenmore dishwasher need its model prefix?', 'The prefix can identify the OEM, such as a Whirlpool-built 665 family, before the serial is interpreted.'],
      ['Why can a production week be known but not the decade?', 'Some manufacturers repeat year codes. The week is read directly, while model era or installation records must resolve the year cycle.'],
      ['What should I enter if the plate shows model, serial, and FD?', 'Keep each field separate. Select the brand, enter the actual serial, and use the FD or model only in the workflow that explicitly requests it.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['bosch', 'Bosch Dishwasher Path'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Dishwasher Path'],
      ['ge-serial-number-lookup', 'GE Dishwasher Path'],
      ['frigidaire-serial-number-lookup', 'Frigidaire Dishwasher Path'],
      ['samsung-serial-number-lookup', 'Samsung Dishwasher Path'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'range-oven-serial-number',
    title: 'Range and Oven Model and Serial Number Guide',
    description: 'Find range, wall-oven, and cooktop labels, select the correct manufacturer path, and use verified model-era evidence without assuming one cooking-product format.',
    h1: 'Range and Oven Model and Serial Number Guide',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Identify whether the product is a freestanding range, wall oven, or cooktop, find its complete rating plate, and then select the manufacturer. Cooking appliances do not share one universal serial date code.',
    supportingIntro: 'The model distinguishes configuration, fuel type, and family. The serial supplies the brand-specific date positions, while verified model-era evidence may narrow a repeating year cycle.',
    primaryCtaLabel: 'Choose Cooking Brand',
    decoderIntro: 'Select the cooking-appliance brand and enter the serial number exactly as shown.',
    decoderPlaceholder: 'Enter range or oven serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'Supported cooking-product paths differ by manufacturer. Whirlpool-family strings use a length-dependent year/week layout, GE uses opening month/year letters, and LG, Frigidaire, and Samsung each use different positions.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model identifies range versus wall oven, fuel type, and generation. It can narrow serial candidates only when reliable family evidence overlaps one of the decoded years.',
    preGridSections: [
      {
        type: 'copy-block',
        id: 'cooking-product-labels',
        title: 'Installed cooking products hide labels in different places',
        body: [
          'Freestanding ranges commonly use the oven frame or storage-drawer opening. Wall ovens often place the plate on trim visible with the door open, while cooktops may require viewing the underside from the cabinet below.',
          'Do not move a built-in or gas appliance solely to search for a rear label. Check the accessible frame, cavity, drawer, paperwork, and manufacturer instructions first.'
        ]
      },
      {
        type: 'table',
        id: 'range-verified-example',
        title: 'Verified Whirlpool range example',
        intro: 'This fixture shows the difference between a serial candidate cycle and model-assisted narrowing.',
        rows: [
          { field: 'Serial RX3026733', meaning: 'Whirlpool year code X; production week 30', why: 'The serial-only result is 1990 or 2020, not an automatic exact year.' },
          { field: 'Model WFE320M0JW0', meaning: 'Recognized Whirlpool range family', why: 'The tested model-family evidence overlaps the 2020 candidate and narrows the result to week 30 of 2020.' }
        ]
      }
    ],
    formatSectionTitle: 'Common range and oven serial number formats',
    formats: [
      { label: 'GE cooking products', pattern: 'Opening month/year letters', meaning: 'The first serial letters usually carry the age logic.', confidence: 'Estimated decade.' },
      { label: 'Whirlpool-family ranges', pattern: '9 or 10 characters with year code + week', meaning: 'The year code position changes by serial length and is followed by week digits.', confidence: 'Estimated decade.' },
      { label: 'Frigidaire / Electrolux cooking products', pattern: 'Factory letters + year/week digits', meaning: 'The first numeric character after the factory letters often points to year, followed by week digits.', confidence: 'Estimated decade.' },
      { label: 'Samsung cooking products', pattern: '11-char or 15-char serial', meaning: 'Year and month positions change by serial length.', confidence: 'Estimated when year codes repeat.' },
      { label: 'LG cooking products', pattern: 'Year digit + 2-digit month', meaning: 'The opening three serial characters usually carry the main date clue.', confidence: 'Estimated decade.' }
    ],
    exampleSectionTitle: 'Range and oven serial number examples',
    examples: [
      { label: 'Whirlpool range with model evidence', serial: 'RX3026733 + WFE320M0JW0', note: 'The serial gives week 30 and the candidate years 1990 or 2020. The tested range-family model narrows the result to 2020.' }
    ],
    locationSectionTitle: 'Where to find the serial number',
    locations: [
      { title: 'Door and frame locations', items: ['Behind the oven door on the frame edge', 'Inside the storage drawer opening on many freestanding ranges'] },
      { title: 'Built-in and wall oven spots', items: ['Trim edge visible when the door is open', 'Side frame area on some built-in installations'] },
      { title: 'Fallback spots', items: ['Rear service label on certain products', 'Owner paperwork if the interior label is damaged'] }
    ],
    problemSectionTitle: 'Common problems',
    problems: [
      'Wall ovens and freestanding ranges place the label in different spots.',
      'The serial result is still estimated because the year code repeats.',
      'A replacement door or trim panel has removed the visible tag.',
      'Only the model number is available from installation paperwork.',
      'The cooking product line spans multiple factories with different serial layouts.'
    ],
    faqs: [
      ['Where is the label on a freestanding range?', 'Inspect the oven frame with the door open and the frame exposed by removing or opening the lower storage drawer.'],
      ['Where is the label on a wall oven?', 'Check the side or lower trim visible when the oven door is open. Avoid removing the installed appliance solely to search behind it.'],
      ['Where is the label on a cooktop?', 'Many cooktops place it on the underside, accessible from the cabinet below. Follow the manufacturer\'s instructions before moving or disconnecting anything.'],
      ['Can a range model number resolve a repeating serial year?', 'Only when reliable model-family evidence overlaps one decoded candidate. The example on this page narrows a Whirlpool cycle that way.'],
      ['Why should fuel type be recorded separately?', 'Gas and electric versions can share styling or family names while using different service information and replacement requirements.'],
      ['Does an installation date prove manufacture date?', 'No. Installation can occur later. Keep installation records as context while treating the supported serial result as the production evidence.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['ge-serial-number-lookup', 'GE Cooking Product Path'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Cooking Product Path'],
      ['frigidaire-serial-number-lookup', 'Frigidaire Cooking Product Path'],
      ['samsung-serial-number-lookup', 'Samsung Cooking Product Path'],
      ['lg-serial-number-lookup', 'LG Cooking Product Path'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'whirlpool-serial-number-lookup',
    title: 'Whirlpool Serial Number Decoder',
    description: 'Decode Whirlpool serial numbers, estimate Whirlpool appliance age, and use supported year/week patterns for refrigerators, washers, dryers, dishwashers, and ranges.',
    htmlTitleOverride: 'Whirlpool Serial Number Decoder — Year Code & Week | Decode My Item',
    metaDescriptionOverride: 'Decode supported 9- and 10-character Whirlpool serial numbers into candidate years and production week, with model-era guidance for repeating cycles.',
    h1: 'Whirlpool Serial Number Decoder',
    badge: 'Brand decoder',
    category: 'appliances',
    brandValue: 'whirlpool',
    intro: 'Use this Whirlpool serial number decoder when you already know the brand and want the fastest supported age path for Whirlpool-family appliances.',
    supportingIntro: 'Whirlpool-family products often use a year-code-plus-week pattern. The current decoder already handles the serial-length split and flags the result as estimated when the Whirlpool year cycle repeats across decades.',
    decoderIntro: 'Whirlpool is preselected. Enter the full serial number exactly as printed on the label.',
    decoderPlaceholder: 'Enter Whirlpool serial number',
    decodeSectionTitle: 'How to decode a Whirlpool serial number',
    decodeSectionBody: 'Most Whirlpool-family appliance serial numbers use a year code plus a production week. Nine-character serials commonly use character 2 for year and characters 3-4 for week, while ten-character serials commonly shift that year code to character 3 and the week digits to characters 4-5.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number helps separate product families, confirm the era, and support the final decade choice when the Whirlpool year code repeats on a 30-year cycle. It is also useful when the serial label is incomplete or damaged.',
    preGridSections: [
      {
        type: 'table',
        id: 'whirlpool-worked-example',
        title: 'Worked Whirlpool range-family example',
        intro: 'The serial and model play separate roles in this regression-backed example.',
        rows: [
          { field: 'RX3026733 length', meaning: '9 alphanumeric characters', why: 'The supported nine-character path reads character 2 as year code and characters 3-4 as production week.' },
          { field: 'X + 30', meaning: 'Candidate years 1990 or 2020; week 30', why: 'The serial alone cannot select the decade.' },
          { field: 'Model WFE320M0JW0', meaning: 'Recognized Whirlpool range family', why: 'Current model-family evidence overlaps 2020, narrowing the tested result without nearest-year guessing.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'whirlpool-cycle-limit',
        title: 'Why Whirlpool results can remain ambiguous',
        body: [
          'Whirlpool year letters repeat on a long cycle. The decoder therefore returns every supported candidate rather than treating a current-looking year as automatically correct.',
          'A model family can narrow the cycle only when its documented era overlaps one candidate. Condition, styling, or an approximate installation date can be useful context, but they do not change the serial characters themselves.'
        ]
      }
    ],
    formatSectionTitle: 'Common Whirlpool serial number formats',
    formats: [
      { label: '9-character Whirlpool serial', pattern: 'Year code in character 2; week digits in characters 3-4', meaning: 'The year code maps the likely year window and the next two digits point to the production week.', confidence: 'Estimated decade. Whirlpool year codes repeat.' },
      { label: '10-character Whirlpool serial', pattern: 'Year code in character 3; week digits in characters 4-5', meaning: 'The serial length changes where Whirlpool stores the year code.', confidence: 'Estimated decade. Whirlpool year codes repeat.' },
      { label: 'Whirlpool-family brands', pattern: 'Same core year/week logic across many related brands', meaning: 'KitchenAid, Roper, and some Kenmore OEM paths often follow similar Whirlpool-family logic.', confidence: 'Estimated until the exact family and era are clear.' }
    ],
    exampleSectionTitle: 'Whirlpool serial number examples',
    examples: [
      { label: 'Verified nine-character fixture', serial: 'RX3026733', note: 'Character 2 is X and characters 3-4 are 30, producing week 30 with candidate years 1990 or 2020.' },
      { label: 'Verified valid-week fixture', serial: 'C21435678', note: 'The supported decoder accepts week 14 and preserves the repeating year-code cycle. Invalid weeks 54 and 99 are rejected.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Refrigerators', items: ['Inside the fresh-food section side wall', 'Behind the crisper drawers on some designs'] },
      { title: 'Laundry products', items: ['Washer lid opening or front-load door frame', 'Dryer door opening or rear cabinet panel'] },
      { title: 'Dishwashers and ranges', items: ['Dishwasher tub lip or inner door frame', 'Range frame behind the oven door or lower drawer opening'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Check whether the Whirlpool serial has 9 or 10 alphanumeric characters after spaces and punctuation are removed.',
      'Use the model number to confirm the product era when the Whirlpool year cycle repeats.',
      'Capture the full serial without trimming prefix letters or zeros.',
      'Try Smart Lookup when the label is worn or when the serial is incomplete.',
      'If the appliance is Kenmore-branded, route the model prefix first before assuming Whirlpool-family logic.'
    ],
    faqs: [
      ['Why does Whirlpool serial length matter?', 'The supported nine-character format reads the year at character 2, while the ten-character format reads it at character 3. The production-week positions shift too.'],
      ['Does Whirlpool encode a calendar month?', 'The supported path returns a production week, not a direct month. Converting that week to an exact calendar date would overstate the available precision.'],
      ['Why can one Whirlpool letter represent two years?', 'The year code repeats on a long cycle. The decoder preserves both candidates until separate era evidence resolves them.'],
      ['Can a model automatically choose the newest candidate?', 'No. A model narrows the cycle only when verified family evidence overlaps one candidate year.'],
      ['Which characters does Whirlpool skip?', 'The current Whirlpool mapping skips I, N, O, Q, and V to reduce confusion. A serial containing an unsupported year code should not be forced into the sequence.'],
      ['What happens when the week is 54 or 99?', 'The decoder rejects it. Supported production weeks must be between 01 and 53.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['washer-serial-number', 'Washer Serial Number Lookup'],
      ['dishwasher-serial-number', 'Dishwasher Serial Number Lookup'],
      ['maytag-serial-number-lookup', 'Maytag'],
      ['kenmore-serial-number-lookup', 'Kenmore'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: (() => {
      const groups = baseLinkGroups();
      groups.splice(2, 0, {
        title: 'Whirlpool Product Guides',
        links: [
          ['refrigerator-serial-number', 'Refrigerator Serial Guide'],
          ['dishwasher-serial-number', 'Dishwasher Serial Guide'],
          ['smart-lookup', 'Model-Based Smart Lookup']
        ]
      });
      return groups;
    })()
  },
  {
    slug: 'ge-serial-number-lookup',
    title: 'GE Serial Number Decoder',
    description: 'Decode GE serial numbers, estimate GE appliance age, and use the supported GE month/year letter pattern for refrigerators, dishwashers, laundry, ranges, and ovens.',
    htmlTitleOverride: 'GE Serial Number Lookup — Manufacture Date Decoder | Decode My Item',
    metaDescriptionOverride: 'Decode GE serial numbers to find manufacture date and appliance age. Supports GE refrigerators, dishwashers, ranges, washers, and ovens. Also works for GE Profile, Monogram, and Cafe.',
    h1: 'GE Serial Number Decoder',
    badge: 'Brand decoder',
    wordmark: 'GE',
    category: 'appliances',
    brandValue: 'ge',
    intro: 'Use this GE serial number decoder when you already know the brand and want a faster supported age path for GE-family appliances.',
    supportingIntro: 'GE-family appliances commonly use opening serial letters for month and year. The current decoder handles that pattern and keeps the result estimated when the GE year letter repeats across decades.',
    decoderIntro: 'GE is preselected. Enter the full GE serial number exactly as printed on the label.',
    decoderPlaceholder: 'Enter GE serial number',
    decodeSectionTitle: 'How to decode a GE serial number',
    decodeSectionBody: 'Many GE-family appliances use the first character for month and the second character for year. That makes the beginning of the serial more important than the trailing sequence digits when you are checking age.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number helps confirm the appliance family, approximate generation, and likely decade. That matters because GE year codes repeat, so a direct serial result may still need product-era context.',
    preGridSections: [
      {
        type: 'copy-block',
        id: 'ge-supported-products',
        title: 'What this decoder currently supports for GE',
        body: [
          'This decoder currently supports GE-family serial numbers for <strong>refrigerators, washers, dryers, dishwashers, ranges, ovens, and microwaves</strong>, using the same opening month/year letter pattern across all of them. The same rule set is also applied on this site to brands within the GE Appliances portfolio &mdash; Caf&eacute;, GE Profile, GE Monogram, and the US Hotpoint brand. RCA-branded appliances have historically shared this same serial-decoding logic on this site, though RCA is not a brand in GE Appliances\' current portfolio.',
          'GE-branded water heaters may use a different serial format that is not covered by this appliance decoder.',
          'The Hotpoint brand sold in the United Kingdom and Europe has separate, unrelated ownership (Whirlpool, via the former Indesit business) and is not covered by this page.'
        ]
      },
      {
        type: 'copy-block',
        id: 'why-multiple-years',
        title: 'Why does GE show multiple possible years?',
        body: [
          'GE-family serial numbers (including Caf&eacute;, GE Profile, GE Monogram, and Hotpoint appliances, and historically RCA-branded appliances) use a 12-year repeating letter cycle for the year code. Because the same letter comes back around every 12 years, a single opening letter can correctly match several different years, and the decoder is designed to show all of them rather than guess at just one.',
          'The model number, product styling, documentation, or install-date context can narrow a repeating GE result to a single year when that evidence is available. Without that additional evidence, the serial characters alone do not determine which of the candidate years is correct, so the honest result is the full list rather than a single picked year.'
        ]
      },
      {
        type: 'table',
        id: 'ge-worked-example-straightforward',
        title: 'Worked example 1: straightforward decode confirmed by model evidence',
        intro: 'This example shows a case where the serial\'s repeating year letter is narrowed to one confirmed year because the model number is recognized in this site\'s model-evidence data.',
        rows: [
          { field: 'Character 1 of RZ825479', meaning: 'Month code "R"', why: 'Resolves to August.' },
          { field: 'Character 2 of RZ825479', meaning: 'Year code "Z"', why: 'The serial alone returns four candidate years: 1988, 2000, 2012, and 2024.' },
          { field: 'Model GTH18GBCDCRBB', meaning: 'Recognized in this site\'s model-evidence data as a GE GTH top-mount refrigerator', why: 'The documented production window for this model family narrows the four candidate years to 2012.' }
        ]
      },
      {
        type: 'table',
        id: 'ge-worked-example',
        title: 'Worked example 2: repeating-cycle ambiguous decode (serial AA182127G, model GTWN8250D0WS)',
        intro: 'This example shows what the current decoder logic determines from the serial alone, and what it does not.',
        rows: [
          { field: 'Character 1 of AA182127G', meaning: 'Month code "A"', why: 'Resolves to January.' },
          { field: 'Character 2 of AA182127G', meaning: 'Year code "A"', why: 'The current decoder returns candidate years 1977, 1989, 2001, 2013, and 2025 &mdash; every year this letter has matched across the 12-year cycle so far.' },
          { field: 'Model GTWN8250D0WS', meaning: 'Not currently in this site\'s model-evidence data', why: 'The model number cannot narrow the candidate years for this example today. What additional evidence would help: a documented model-year introduction date, a dated manual or nameplate photo, or another independently known install date.' }
        ]
      },
      {
        type: 'table',
        id: 'ge-worked-example-unsupported',
        title: 'Worked example 3: historical code not yet supported by this decoder',
        intro: 'This example shows a serial that matches GE\'s general shape (two letters followed by digits) but falls outside the era this decoder currently resolves.',
        rows: [
          { field: 'Character 1 of AB123456', meaning: 'Month code "A"', why: 'Resolves to January.' },
          { field: 'Character 2 of AB123456', meaning: 'Year code "B"', why: 'GE\'s own manufacture-date documentation records "B" as the historical year 1945. This site\'s decoder currently covers GE\'s documented 1977-present rotation and does not yet include that earlier era, so no year is returned here &mdash; this is a coverage limitation of this decoder, not a sign that "B" is undocumented by GE.' },
          { field: 'Model number (if available)', meaning: 'Only useful if recognized in this site\'s model-evidence data', why: 'Model evidence cannot substitute for an era this decoder does not yet cover. For a pre-1977 GE serial, GE\'s own manufacture-date reference or Smart Lookup may help instead.' }
        ]
      }
    ],
    formatSectionTitle: 'Common GE serial number formats',
    formats: [
      { label: 'GE refrigerator format', pattern: 'Month letter in character 1; year letter in character 2', meaning: 'The first two letters usually carry the useful date logic.', confidence: 'Estimated decade. GE year letters repeat.' },
      { label: 'GE laundry format', pattern: 'Same opening month/year letter structure', meaning: 'Washers and dryers typically use the same opening-letter date approach.', confidence: 'Estimated decade.' },
      { label: 'GE cooking and dishwashing products', pattern: 'Same opening month/year letter structure', meaning: 'Ranges, ovens, and dishwashers usually follow the same first-two-letter timing logic.', confidence: 'Estimated decade.' }
    ],
    exampleSectionTitle: 'GE serial number examples',
    examples: [
      { label: 'Illustrative GE pattern', serial: 'AZ123456', note: 'Illustrative GE-family pattern. The supported decode path treats the first letter as month and the second letter as year.' },
      { label: 'Cycle warning', serial: '...Z...', note: 'GE year letters repeat, so the decoder may still leave the decade estimated until model era or install context confirms it.' },
      { label: 'Appliance-family reminder', serial: 'Opening letters matter most', note: 'The serial sequence after the first two letters is usually production tracking rather than the core age signal on GE-family appliances.' },
      { label: 'Repeating-cycle example', serial: 'AA182127G', note: 'Month code A = January; year code A = 1977, 1989, 2001, 2013, or 2025. The serial alone cannot pick one of the five; see the worked example above.' },
      { label: 'Model-assisted narrowing example', serial: 'RZ825479', note: 'Serial alone: month code R = August; year code Z = 1988, 2000, 2012, or 2024. Paired with model GTH18GBCDCRBB (a GE GTH top-mount refrigerator model in this site\'s model data, associated with 2011-2013), the result narrows to 2012.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Refrigerators', items: ['Inside the fresh-food section side wall', 'Behind a drawer or on upper interior trim in some models'] },
      { title: 'Laundry products', items: ['Washer lid opening or underside of the lid', 'Dryer door opening or rear cabinet label'] },
      { title: 'Ranges and dishwashers', items: ['Range frame behind the oven door or drawer opening', 'Dishwasher inner door frame or tub edge'] },
      { title: 'Microwaves', items: ['Interior cavity frame edge', 'Rear or side exterior panel, depending on over-the-range or countertop mount'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Double-check the opening serial letters because those are usually the important GE date positions.',
      'Use the model number and product type to confirm the decade when the year letter repeats.',
      'Try Smart Lookup if the opening letters are worn or missing.',
      'Do not treat Samsung, LG, or Whirlpool serial logic as interchangeable with GE.',
      'Capture the full serial even if the main age clue is at the front of the code.',
      'If the decoder shows several candidate years, that reflects the real repeating GE cycle rather than an error.',
      'A model number that is not yet in this site\'s model data cannot narrow the candidates on its own.'
    ],
    faqs: [
      ['How old is my GE appliance?', 'Use the serial number from the label. GE usually stores the age signal in the opening month and year letters rather than the model number.'],
      ['Can the GE model number tell me the age?', 'Not reliably by itself. It is better for identifying the family and confirming the likely decade when the serial year letter repeats.'],
      ['Why does the GE result still look estimated?', 'GE year letters repeat, so the decoder may still need model-family or installation-era context to confirm the decade.'],
      ['Where is the GE serial number label located?', 'Most GE appliances place it on an interior frame, cabinet wall, or opening edge depending on product type.'],
      ['Can this support claim documentation?', 'Yes. Just note when the decade is still estimated because the GE year code repeats across multiple cycles.'],
      ['What manufacture date does a GE serial number show?', 'A GE serial resolves to a month from the first character and one or more candidate years from the second character. When the year letter has repeated more than once, more than one year can be correct.'],
      ['Why do GE serial year codes repeat?', 'GE-family serials use a 12-year repeating letter cycle. The same letter reappears every 12 years, so it can validly represent several different years rather than exactly one.'],
      ['Can the model number narrow multiple GE candidate years?', 'Sometimes. If the model is recognized in this site\'s model data with a known production window, the candidates can narrow to a single year. If the model is not recognized, the full list of candidate years remains the honest result.'],
      ['What if my GE serial number is unsupported?', 'Confirm the full serial was entered exactly as printed, check that the opening two characters are letters rather than digits, and try Smart Lookup if the format still does not resolve.'],
      ['Who owns GE Appliances now?', 'GE Appliances has been owned by Qingdao Haier since a 2016 acquisition, though it continues operating under the GE Appliances name from Louisville, Kentucky under a long-term brand license. This ownership history does not change the serial-decoding rule used above.'],
      ['When was General Electric founded?', 'General Electric was formed in 1892 from the merger of the Edison General Electric Company and the Thomson-Houston Electric Company. This is background information and is separate from the technical serial-number rule documented on this page.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['smart-lookup', 'Smart Lookup'],
      ['serial-number-location-guide', 'Serial Number Location Guide'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups(),
    postGridSections: [
      {
        type: 'raw',
        html: `
    <div class="bp-section-card bp-full-width" id="ge-appliance-categories">
      <div class="bp-section-card-head">
        <span class="material-symbols-outlined bp-section-icon" style="color:#44e5c2;">category</span>
        <h2>Decoding GE appliances by product type</h2>
      </div>
      <div class="fmt-cards-grid">
        <div class="fmt-card"><div class="fmt-card-top"><span class="fmt-label">Refrigerators</span></div><p class="fmt-meaning">Same opening month/year letter pattern. Label is typically inside the fresh-food compartment.</p></div>
        <div class="fmt-card"><div class="fmt-card-top"><span class="fmt-label">Washers &amp; dryers</span></div><p class="fmt-meaning">Same opening month/year letter pattern. Label is on the lid opening or door frame.</p></div>
        <div class="fmt-card"><div class="fmt-card-top"><span class="fmt-label">Dishwashers</span></div><p class="fmt-meaning">Same opening month/year letter pattern. Label is on the inner door frame or tub edge.</p></div>
        <div class="fmt-card"><div class="fmt-card-top"><span class="fmt-label">Ranges &amp; ovens</span></div><p class="fmt-meaning">Same opening month/year letter pattern. Label is behind the oven door or drawer opening.</p></div>
        <div class="fmt-card"><div class="fmt-card-top"><span class="fmt-label">Microwaves</span></div><p class="fmt-meaning">Same opening month/year letter pattern. Label location varies by mount type; check the interior cavity frame or rear panel first.</p></div>
      </div>
      <p style="margin-top:12px;">The current decoder uses one shared GE-family rule set across every category above rather than a separate rule per appliance type. If a future update adds a category-specific exception, it will be reflected in the format tables and in the decoder logic together.</p>
    </div>`
      },
      {
        type: 'raw',
        html: `
    <div class="bp-section-card bp-full-width" id="ge-decoding-eras">
      <div class="bp-section-card-head">
        <span class="material-symbols-outlined bp-section-icon" style="color:#44e5c2;">history</span>
        <h2>Important GE decoding eras</h2>
      </div>
      <ul class="bp-check-list">
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><strong>Before 1977 (documented by GE, not yet supported by this decoder):</strong> GE's own manufacture-date reference documents historical year codes back to 1944, reusing many of the same letters that later repeat through the 1977-2025 rotation this decoder returns. This site currently limits its repeating-cycle results to that modern 1977-present rotation and does not yet represent the older historical codes &mdash; that is a coverage limitation of this decoder, not a boundary in GE's own documentation.</span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><strong>1977&ndash;2016 (GE-owned manufacturing):</strong> the opening-letter month/year pattern this decoder covers was used across GE's own appliance manufacturing, including Appliance Park in Louisville, Kentucky.</span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><strong>2016&ndash;present (Haier ownership):</strong> GE Appliances was sold to Qingdao Haier in 2016. Serials produced since the sale continue using the same opening-letter pattern under the long-term GE Appliances brand license; this decoder does not currently distinguish pre- and post-2016 units beyond the shared candidate-year list.</span></li>
      </ul>
    </div>`
      },
      {
        type: 'copy-block',
        id: 'ge-history',
        title: 'GE company history and ownership',
        body: [
          'This section covers GE\'s corporate history. It is included for background only and is not used as evidence for any serial-decoding rule on this page.',
          'General Electric was formed on April 15, 1892, through the merger of the Edison General Electric Company and the Thomson-Houston Electric Company. Edison General Electric traced back to Thomas Edison\'s electric-light and generating businesses, which he consolidated under that name around 1889&ndash;1890. Thomson-Houston had grown out of an earlier company founded by inventors Elihu Thomson and Edwin Houston, and was led by Charles A. Coffin, who became the first president of the merged General Electric Company. Edison served briefly on the new company\'s board before stepping away from day-to-day involvement, though he continued to hold GE patents and act as a consultant.',
          'GE\'s major-appliance manufacturing became centered at Appliance Park, a purpose-built industrial campus in Louisville, Kentucky. Ground was broken in 1951, and the first products (a shipment of automatic dryers) left the plant in February 1953. The campus grew to house multiple appliance factories and remains the headquarters of GE Appliances today.',
          'GE expanded into related appliance brands over the following decades. In 1918, the Hotpoint Electric Heating Company combined with GE\'s heating-device business to form the Edison Electric Appliance Company, and GE purchased Hotpoint outright in 1927 &mdash; which is why the US Hotpoint brand shares GE\'s appliance manufacturing lineage and, on this site, the same serial-decoding rules. The Hotpoint brand sold in the United Kingdom and Europe today has separate, unrelated ownership under Whirlpool and is not covered by this page.',
          'In January 2016, GE announced the sale of its appliance division to Qingdao Haier Co., Ltd. for $5.4 billion; the sale closed in June 2016. GE Appliances, including the GE, Cafe, GE Profile, and GE Monogram brand names, continued operating under a long-term brand license from GE to Haier, still headquartered at Appliance Park in Louisville.'
        ]
      },
      {
        type: 'raw',
        html: `
    <div class="bp-section-card bp-full-width" id="ge-limitations">
      <div class="bp-section-card-head">
        <span class="material-symbols-outlined bp-section-icon" style="color:#44e5c2;">block</span>
        <h2>Unsupported formats and limitations</h2>
      </div>
      <ul class="bp-check-list">
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span>Only twelve letters (A, D, F, G, H, L, M, R, S, T, V, Z) currently carry a recognized year code. A second character outside that set, as in Worked Example 3 above, does not decode.</span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span>This site's decoder currently limits its repeating-cycle results to GE's documented 1977-present rotation. GE's own manufacture-date reference documents historical codes back to 1944 that are not yet represented in this rule set &mdash; a coverage limitation here, not a gap in GE's documentation.</span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span>GE-branded water heaters may use a different serial format that is not covered by this appliance decoder.</span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span>This decoder does not resolve exact day of manufacture, only month and one or more candidate years.</span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span>Model-based narrowing only works for models already present in this site's model-evidence data; an unrecognized model cannot narrow a repeating-cycle result.</span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span>UK/European Hotpoint appliances are a separate, unrelated brand (Whirlpool ownership) and are not covered by this page.</span></li>
      </ul>
    </div>`
      },
      {
        type: 'raw',
        html: `
    <div class="bp-section-card bp-full-width" id="ge-evidence-sources">
      <div class="bp-section-card-head">
        <span class="material-symbols-outlined bp-section-icon" style="color:#44e5c2;">fact_check</span>
        <h2>Evidence and sources</h2>
      </div>
      <p>Technical serial-decoding claims and historical/company-background claims on this page come from separate source sets and are not used to support one another.</p>
      <h3>Technical sources for the serial-decoding rule</h3>
      <ul class="bp-check-list">
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><a href="https://products.geappliances.com/appliance/gea-support-search-content?contentId=16195" rel="noopener nofollow">GE Appliance &mdash; How to Determine the Age or Manufacture Date (official manufacture-date chart; primary source for the month/year letter pattern)</a></span></li>
      </ul>
      <h3>Historical and ownership sources</h3>
      <p><strong>Primary/institutional sources</strong></p>
      <ul class="bp-check-list">
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><a href="https://edison.rutgers.edu/life-of-edison/companies/company-details/electric-light,-domestic/edison-general-electric-company" rel="noopener nofollow">Thomas A. Edison Papers, Rutgers University &mdash; Edison General Electric Company</a></span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><a href="https://pressroom.geappliances.com/news/qingdao-haier-acquires-ge-appliances" rel="noopener nofollow">GE Appliances Pressroom &mdash; Qingdao Haier Acquires GE Appliances (2016 sale, continued GE Appliances branding, Louisville headquarters)</a></span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><a href="https://pressroom.geappliances.com/news/ge-appliances-celebrates-70-years-of-innovation-for-american-homes-from-its-headquarters-in-louisville-kentucky" rel="noopener nofollow">GE Appliances Pressroom &mdash; GE Appliances Celebrates 70 Years of Innovation (Appliance Park's 1951 groundbreaking and February 1953 first shipment)</a></span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><a href="https://pressroom.geappliances.com/news/ge-appliances-corporate-fact-sheet" rel="noopener nofollow">GE Appliances Corporate Fact Sheet (current brand portfolio; confirms RCA is not a current GE Appliances brand)</a></span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><a href="https://www.hotpoint.com/hotpoint-history/" rel="noopener nofollow">Hotpoint official brand history (1918 merger with General Electric)</a></span></li>
      </ul>
      <p style="margin-top:10px;"><strong>Supplemental background (not principal evidence)</strong></p>
      <ul class="bp-check-list">
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><a href="https://en.wikipedia.org/wiki/Thomson-Houston_Electric_Company" rel="noopener nofollow">Thomson-Houston Electric Company, supplemental background for the 1892 merger</a></span></li>
        <li class="bp-check-item"><span class="material-symbols-outlined bp-check-icon">check_circle</span><span><a href="https://en.wikipedia.org/wiki/Hotpoint" rel="noopener nofollow">Hotpoint, supplemental background for the 1927 outright GE acquisition and the separate UK/European ownership</a></span></li>
      </ul>
      <p style="margin-top:10px;"><em>Last reviewed: July 24, 2026.</em></p>
    </div>`
      }
    ]
  },
  {
    slug: 'samsung-serial-number-lookup',
    title: 'Samsung Serial Number Decoder',
    description: 'Decode Samsung appliance serial numbers, estimate appliance age, and use the supported 11-character and 15-character Samsung serial formats with clear confidence notes.',
    htmlTitleOverride: 'Samsung Serial Number Lookup — Manufacture Date & Age | Decode My Item',
    metaDescriptionOverride: 'Decode Samsung serial numbers to find manufacture date, appliance age, and production week. Supports Samsung refrigerators, washers, dryers, and dishwashers. Fast and free.',
    h1: 'Samsung Serial Number Decoder',
    badge: 'Brand decoder',
    category: 'appliances',
    brandValue: 'samsung',
    intro: 'Use this Samsung serial number decoder when you already know the brand and want a faster age path for supported Samsung appliances.',
    supportingIntro: 'Samsung appliance serials use supported year/month character positions, but some year codes repeat. The current decoder handles both the 11-character and 15-character appliance patterns and keeps the result estimated when a decade cycle remains unresolved.',
    decoderIntro: 'Samsung is preselected. Enter the full appliance serial number exactly as printed on the label.',
    decoderPlaceholder: 'Enter Samsung appliance serial number',
    decodeSectionTitle: 'How to decode a Samsung serial number',
    decodeSectionBody: 'Samsung appliance decoding depends on serial length. On supported 11-character serials, the year and month commonly sit in positions 4-5. On supported 15-character serials, the year and month commonly sit in positions 8-9.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number helps confirm whether the product is an appliance, a TV, or another electronics line, and it also helps resolve the decade when a Samsung year code repeats. That context is important because Samsung appliance and Samsung TV paths should not be mixed.',
    preGridSections: [
      {
        type: 'copy-block',
        id: 'appliance-vs-tv',
        title: 'Samsung appliance serials vs. Samsung TV serials vs. model numbers',
        body: [
          'Samsung appliances (refrigerators, washers, dryers, dishwashers, ranges) and Samsung TVs or monitors use related but separate identifier formats. Both families commonly use a letter code for year and a second character for month, but the character positions and supported serial lengths differ, so mixing the two paths can produce a confusing result.',
          'A Samsung model number identifies the product family and generation. On its own it does not provide an exact manufacture date &mdash; the serial number is what this decoder reads for the supported year and month code.',
          'Some newer Samsung electronics use serial formats that are not publicly documented in a way this tool can reliably parse. When that happens, <a href="/smart-lookup">Smart Lookup</a> can use the model number and any available context to estimate a product era instead of an exact date.'
        ]
      },
      {
        type: 'copy-block',
        id: 'model-vs-serial',
        title: 'Model number vs. serial number',
        body: [
          'The model number and serial number answer different questions. The model number describes what the product is: the family, generation, and features. The serial number is what this decoder reads to estimate when a specific unit was made.',
          'A model number can rule out an impossible decade for a repeating Samsung year code &mdash; for example, a model line introduced in the 2020s cannot be the 2000s candidate from the same year letter &mdash; but it does not replace the serial number as the primary age signal.'
        ]
      }
    ],
    formatSectionTitle: 'Common Samsung serial number formats',
    formats: [
      { label: '11-character Samsung appliance serial', pattern: 'Year in character 4; month in character 5', meaning: 'The supported decoder checks character 4 for year code and character 5 for month code on this format.', confidence: 'Estimated when the year letter repeats.' },
      { label: '15-character Samsung appliance serial', pattern: 'Year in character 8; month in character 9', meaning: 'The supported decoder checks the later year/month positions on longer Samsung appliance serials.', confidence: 'Estimated when the year letter repeats.' },
      { label: 'Samsung cross-category warning', pattern: 'Appliance logic is not the same as Samsung phone logic', meaning: 'Use the appliance path here and the separate TV or electronics pages when the product is not a major appliance.', confidence: 'High confidence on category split.' }
    ],
    exampleSectionTitle: 'Samsung serial number examples',
    examples: [
      { label: 'Illustrative 11-character pattern', serial: 'XXXABXXXXXX', note: 'Illustrative 11-character Samsung appliance pattern. The current decoder checks character 4 for year and character 5 for month.' },
      { label: 'Illustrative 15-character pattern', serial: 'XXXXXXXABXXXXXX', note: 'Illustrative 15-character Samsung appliance pattern. The current decoder checks character 8 for year and character 9 for month.' },
      { label: 'Category reminder', serial: 'Appliance serials only on this page', note: 'Samsung TVs use a related but separate route. Use the appliance page only when the product is a refrigerator, washer, dryer, dishwasher, range, or oven.' },
      { label: 'Worked appliance example', serial: 'A00843ESC00128', note: 'This 14-character serial is supported: character 8 (S) is the year code and character 9 (C) is the month code. The current decoder returns year 2009 or 2029 and month December. Both years are shown because the Samsung year code repeats on a 20-year cycle.' },
      { label: 'What the tool can and cannot determine (TV/electronics)', serial: '07R5CAHJB001234', note: 'A documented Samsung TV/monitor serial pattern: character 8 (J) is the year code and character 9 (B) is the month code, giving year 2017 or 2037 and month November. The decoder can identify the supported year/month code on recognized formats, but it cannot confirm which of the two candidate years is correct without model or documentation context, and some newer TV serials may not be publicly decodable at all. See the Samsung TV Serial Number Decoder for the dedicated tool.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Refrigerators', items: ['Inside the fresh-food compartment wall', 'Behind a crisper drawer or on upper interior trim in some models'] },
      { title: 'Laundry products', items: ['Washer lid underside or door frame', 'Dryer door opening, lower frame, or rear panel'] },
      { title: 'Dishwashers and ranges', items: ['Dishwasher inner door frame or tub lip', 'Range frame behind the door or around the lower drawer opening'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Confirm whether the product is a Samsung appliance or a Samsung TV, monitor, or phone.',
      'Check whether the serial is 11 characters or 15 characters before assuming the year/month positions.',
      'Use the model number to resolve the decade when a Samsung year code repeats.',
      'Try Smart Lookup when the label is partial or when the serial family does not match a supported path.',
      'Capture the full code because Samsung year and month positions move with serial length.'
    ],
    faqs: [
      ['How old is my Samsung appliance?', 'Use the full serial number from the product tag. The supported Samsung appliance decoder checks the serial-length-specific year and month positions.'],
      ['Is this page for Samsung appliances or Samsung TVs?', 'This page is for major Samsung appliances. Use the Samsung TV page or Smart Lookup for TV and electronics-only searches.'],
      ['Why does the Samsung result still look estimated?', 'Some Samsung year codes repeat, so the decoder may still need model-era context to confirm the decade.'],
      ['Where is the Samsung serial number label located?', 'It depends on product type. Refrigerators usually place it inside the cabinet, laundry products place it around the opening, and ranges or dishwashers place it on the frame.'],
      ['Can this support claim documentation?', 'Yes. It is useful for age support and replacement research, especially when the product category is clear and the full serial is available.'],
      ['Can a Samsung TV serial number show the manufacture date?', 'On supported Samsung TV and monitor serial formats, yes: the decoder can read a year and month code using the same style of character-position logic as Samsung appliances. Some newer TV serial formats are not publicly decodable, and the year code repeats every 20 years, so the result is still a candidate rather than a single confirmed date.'],
      ['Is the model number the same as the serial number?', 'No. The model number identifies the product family and generation. The serial number is the field this decoder reads to estimate the manufacture year and month.'],
      ['What should I do if the serial number is unsupported?', 'Confirm you copied the full serial exactly as printed, check whether the product is an appliance or a TV/electronics item, and try Smart Lookup with the model number if the standard decoder cannot resolve the format.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['samsung-tv-serial-number-decoder', 'Samsung TV Serial Number Decoder'],
      ['how-old-is-my-electronics', 'How Old Is My Electronics?'],
      ['serial-number-location-guide', 'Serial Number Location Guide'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'lg-serial-number-lookup',
    title: 'LG Serial Number Decoder',
    description: 'Decode LG appliance serial numbers, estimate appliance age, and use the supported LG year-digit-plus-month pattern with clear confidence notes.',
    h1: 'LG Serial Number Decoder',
    badge: 'Brand decoder',
    category: 'appliances',
    brandValue: 'lg',
    intro: 'Use this LG serial number decoder when you already know the brand and want the fastest supported LG appliance age path.',
    supportingIntro: 'LG appliance serial numbers commonly open with a year digit followed by a two-digit month. The current decoder handles that supported pattern and leaves the decade estimated when the year digit could match more than one cycle.',
    decoderIntro: 'LG is preselected. Enter the full serial number exactly as printed on the label.',
    decoderPlaceholder: 'Enter LG serial number',
    decodeSectionTitle: 'How to decode an LG serial number',
    decodeSectionBody: 'Supported LG appliance serial numbers commonly use character 1 as the last digit of the year and characters 2-3 as the month. That makes the opening three characters the most important part of the serial for age checks.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number helps confirm the product family, generation, and likely decade. That matters because the LG year position is a single digit, so the decoder may still need model-era context to resolve the final decade.',
    preGridSections: [
      {
        type: 'table',
        id: 'lg-worked-example',
        title: 'Worked LG washer example',
        intro: 'This tested example preserves the serial result before applying model-era evidence.',
        rows: [
          { field: 'Serial 412TATG1H105', meaning: 'Year digit 4; month 12', why: 'The serial returns December with candidate years 2004, 2014, or 2024.' },
          { field: 'Model WM3470HWA', meaning: 'Known LG washer family context', why: 'The current model evidence overlaps 2014 and narrows the tested result to December 2014.' },
          { field: 'Serial without model', meaning: 'Three candidate years remain', why: 'The decoder does not silently select the newest decade.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'lg-model-versus-serial',
        title: 'LG model and serial fields are not interchangeable',
        body: [
          'LG states that its product model numbers begin with a letter, while its appliance serial numbers begin with three digits. In the supported appliance path, those opening serial digits supply the year-cycle and month signal.',
          'LG televisions and computer products have separate identification workflows. This page preselects the appliance decoder and should not be used to infer a TV date from a model number.'
        ]
      }
    ],
    formatSectionTitle: 'Common LG serial number formats',
    formats: [
      { label: '8-12 character LG appliance serials', pattern: 'Year digit in character 1; month digits in characters 2-3', meaning: 'The opening digit and next two month digits usually drive the supported LG age estimate.', confidence: 'Estimated decade. LG year digits repeat.' },
      { label: 'LG refrigerators', pattern: 'Same opening year/month pattern', meaning: 'Refrigerators commonly follow the same first-digit year and two-digit month logic.', confidence: 'Estimated decade.' },
      { label: 'LG laundry and kitchen products', pattern: 'Same opening year/month pattern', meaning: 'Washers, dryers, dishwashers, and ranges often use the same opening LG date structure.', confidence: 'Estimated decade.' }
    ],
    exampleSectionTitle: 'LG serial number examples',
    examples: [
      { label: 'Verified LG washer fixture', serial: '412TATG1H105 + WM3470HWA', note: 'The serial returns December and 2004/2014/2024. Model evidence narrows the tested result to 2014.' },
      { label: 'Verified LG-built Kenmore fixture', serial: '795.74053.410 + 410KR00219', note: 'The Kenmore model prefix routes to LG. The serial returns October and candidate years 2004, 2014, or 2024.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Refrigerators', items: ['Inside the fresh-food section side wall', 'Behind a crisper drawer or on upper interior trim'] },
      { title: 'Laundry products', items: ['Washer door opening or lid rim', 'Dryer door opening or rear service panel'] },
      { title: 'Dishwashers and ranges', items: ['Dishwasher inner frame or tub lip', 'Range frame behind the door or lower drawer opening'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Use the model number to resolve the final decade when the LG year digit repeats.',
      'Double-check the first three characters because they carry the supported LG age logic.',
      'Try Smart Lookup if the serial is partial or the month digits are unreadable.',
      'Make sure the product is an appliance path rather than an LG TV-only product.',
      'Capture the full code even though the opening characters carry the main date signal.'
    ],
    faqs: [
      ['Which LG serial characters are used for appliance age?', 'The supported path reads character 1 as a repeating year digit and characters 2-3 as a two-digit month.'],
      ['Why does an LG serial return three possible years?', 'The serial contains only the final year digit, so the same value can recur every decade. The model may narrow it only when verified era evidence exists.'],
      ['How can I distinguish an LG model from a serial?', 'LG guidance says model numbers begin with a letter while appliance serial numbers begin with three digits. Record both fields exactly as labeled.'],
      ['Does this page decode LG televisions?', 'No. It preselects the LG appliance path. Television model and serial research belongs in the electronics workflow.'],
      ['Where is the LG refrigerator label?', 'LG identifies interior liner locations, commonly the right side on older models and the left side on newer refrigerators.'],
      ['Where is the LG laundry label?', 'Front-load washer and dryer labels are commonly around the door opening; top-load washer locations can include under the lid, rear controls, or a side panel.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['washer-serial-number', 'Washer Serial Number Lookup'],
      ['range-oven-serial-number', 'Range & Oven Serial Number Lookup'],
      ['samsung-serial-number-lookup', 'Samsung'],
      ['ge-serial-number-lookup', 'GE'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'frigidaire-serial-number-lookup',
    title: 'Frigidaire Serial Number Decoder',
    description: 'Decode Frigidaire serial numbers, estimate appliance age, and use the supported factory-letter-plus-year/week pattern with clear confidence notes.',
    h1: 'Frigidaire Serial Number Decoder',
    badge: 'Brand decoder',
    category: 'appliances',
    brandValue: 'frigidaire',
    intro: 'Use this Frigidaire serial number decoder when you already know the brand and want a faster supported age path for Frigidaire-family appliances.',
    supportingIntro: 'Frigidaire-family serial numbers often begin with factory letters and then shift into a year digit plus production week. The current decoder handles that supported pattern and keeps the result estimated when the year digit overlaps more than one decade.',
    decoderIntro: 'Frigidaire is preselected. Enter the full serial number exactly as printed on the label.',
    decoderPlaceholder: 'Enter Frigidaire serial number',
    decodeSectionTitle: 'How to decode a Frigidaire serial number',
    decodeSectionBody: 'Supported Frigidaire-family serial numbers commonly use the first numeric character after the opening factory letters as the year digit, followed by week digits that narrow the production window. The leading factory letters still matter and should not be removed.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number helps confirm the product family and era when the year digit repeats across decades. It also helps when the product is sold under an Electrolux-family or private-label variant with similar-looking serials.',
    preGridSections: [
      {
        type: 'table',
        id: 'frigidaire-worked-example',
        title: 'Worked Frigidaire refrigerator example',
        intro: 'This regression-backed pair shows both the raw serial cycle and the narrower model-supported result.',
        rows: [
          { field: 'Serial BA10515647', meaning: 'Factory prefix BA; year digit 1; week 05', why: 'Serial alone returns candidate years 1991, 2001, 2011, or 2021.' },
          { field: 'Model FFTR2045VS0', meaning: 'Recognized top-freezer refrigerator family', why: 'Current model-era evidence intersects the 2021 candidate.' },
          { field: 'Combined result', meaning: 'Week 05 of 2021', why: 'The model narrows a serial-valid candidate; it does not replace the serial decode.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'frigidaire-prefix-week',
        title: 'Keep the factory prefix and validate the production week',
        body: [
          'The opening factory letters are part of the Frigidaire-family structure and should not be discarded. The numeric year and week positions are read after that prefix.',
          'The decoder rejects impossible weeks such as 54. A readable year digit paired with an invalid week is not treated as a partial successful manufacture date.'
        ]
      }
    ],
    formatSectionTitle: 'Common Frigidaire serial number formats',
    formats: [
      { label: 'Frigidaire refrigerators', pattern: 'Factory letters followed by year digit + week digits', meaning: 'The first numeric character after the plant code is often the year digit, followed by week information.', confidence: 'Estimated decade. Product line matters.' },
      { label: 'Frigidaire laundry products', pattern: 'Same factory-letter + year/week structure', meaning: 'Washers and dryers often use the same main timing structure.', confidence: 'Estimated decade.' },
      { label: 'Frigidaire dishwashers and ranges', pattern: 'Same factory-letter + year/week structure', meaning: 'Cooking and dishwashing products usually follow the same year-digit and week-digit approach.', confidence: 'Estimated decade.' }
    ],
    exampleSectionTitle: 'Frigidaire serial number examples',
    examples: [
      { label: 'Verified model-refined fixture', serial: 'BA10515647 + FFTR2045VS0', note: 'The serial encodes week 05 with four candidate decades; the tested refrigerator model narrows the result to 2021.' },
      { label: 'Verified serial-only fixture', serial: 'NF11910958', note: 'The current decoder returns week 19 and candidate years 2001, 2011, or 2021. No single year is invented.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Refrigerators', items: ['Inside the fresh-food section side wall', 'Behind produce drawers or on upper interior trim'] },
      { title: 'Laundry products', items: ['Washer lid underside or door opening', 'Dryer door rim or rear cabinet label'] },
      { title: 'Ranges and dishwashers', items: ['Range oven frame or lower drawer opening', 'Dishwasher inner door frame or tub lip'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Keep the factory letters in the serial because they help determine the correct Frigidaire-family path.',
      'Use the model number when the year digit repeats across multiple decades.',
      'Try Smart Lookup if the first numeric characters are worn or incomplete.',
      'Check whether the product is an Electrolux-family variant with a similar serial structure.',
      'Capture the full code without trimming spaces, letters, or suffix characters.'
    ],
    faqs: [
      ['What do the opening letters in a Frigidaire serial mean here?', 'They are retained as the factory prefix. The supported decoder reads the following numeric positions for the repeating year digit and production week.'],
      ['Why does the Frigidaire year digit return several decades?', 'A single numeric year code repeats. The serial alone cannot choose among all supported candidate years.'],
      ['How can model FFTR2045VS0 narrow the result?', 'The repository contains model-era evidence for that refrigerator family. It overlaps the 2021 serial candidate in the tested example.'],
      ['Does a week code of 54 decode?', 'No. The current Frigidaire-family implementation accepts production weeks 01 through 53 and rejects impossible values.'],
      ['Where is the label on a Frigidaire dishwasher?', 'Open the door and check the interior side of the door and the right side of the tub.'],
      ['Where is the label on a Frigidaire range?', 'Inspect the oven side trim and the storage-drawer frame while the door or drawer is open.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['dishwasher-serial-number', 'Dishwasher Serial Number Lookup'],
      ['range-oven-serial-number', 'Range & Oven Serial Number Lookup'],
      ['ge-serial-number-lookup', 'GE'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'maytag-serial-number-lookup',
    title: 'Maytag Serial Number Decoder',
    description: 'Decode Maytag serial numbers, estimate appliance age, and use supported legacy and Whirlpool-era Maytag serial paths with clear confidence notes.',
    h1: 'Maytag Serial Number Decoder',
    badge: 'Brand decoder',
    category: 'appliances',
    brandValue: 'maytag',
    intro: 'Use this Maytag serial number decoder when you already know the brand and need the fastest supported age path across older and newer Maytag appliances.',
    supportingIntro: 'Maytag can follow more than one serial family. The current decoder handles Whirlpool-era Maytag logic and legacy pre-2006 logic, then flags the result when an era choice is still needed.',
    decoderIntro: 'Maytag is preselected. Enter the full serial number exactly as printed on the label.',
    decoderPlaceholder: 'Enter Maytag serial number',
    decodeSectionTitle: 'How to decode a Maytag serial number',
    decodeSectionBody: 'Modern Whirlpool-era Maytag products often follow a year-code-plus-week pattern similar to Whirlpool-family serials. Older Maytag products may instead use the last two characters for year and month, which is why the era selector can matter.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number helps separate older legacy Maytag products from Whirlpool-era Maytag platforms. That context matters when the serial format repeats or when the decoder asks you to choose an era.',
    preGridSections: [
      {
        type: 'table',
        id: 'maytag-dual-era-example',
        title: 'Worked Maytag dual-era example',
        intro: 'When the era is unknown, the current workflow evaluates both supported styles and keeps their results separate.',
        rows: [
          { field: 'Serial 12345678WA — pre-2006 path', meaning: 'Ending W = year; A = January', why: 'The tested legacy path returns January with candidate years 1999 or 2023.' },
          { field: 'Same serial — post-2006 path', meaning: 'Whirlpool-family length/position logic', why: 'The tested modern path returns candidate years 2013 or 2043.' },
          { field: 'Era not selected', meaning: '1999, 2013, or 2043 remain', why: 'The interface does not display a fake single confident age when both formats match.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'maytag-era-decision',
        title: 'Why the 2006 era boundary matters',
        body: [
          'Legacy Maytag serials can place year and month codes at the end, while post-2006 Whirlpool-era products commonly use Whirlpool-family year/week positions. Applying the newer rule to every older Maytag would be misleading.',
          'Use the model family, purchase or installation record, styling, and label format to choose an era. If those clues do not settle it, preserve the combined candidate set and use Smart Lookup rather than forcing a choice.'
        ]
      }
    ],
    formatSectionTitle: 'Common Maytag serial number formats',
    formats: [
      { label: 'Post-2006 Maytag', pattern: 'Whirlpool-style year code + week digits', meaning: 'Many modern Maytag products follow Whirlpool-family year/week logic.', confidence: 'Estimated decade. Era can still matter.' },
      { label: 'Pre-2006 Maytag', pattern: 'Second-to-last character for year, last character for month', meaning: 'Legacy Maytag products often store year and month at the end of the serial.', confidence: 'Estimated until era is confirmed.' },
      { label: 'Maytag product-family overlap', pattern: 'Laundry and kitchen products can appear in either path', meaning: 'The current decoder asks for an era when the serial structure alone is not enough to pick the right family.', confidence: 'Estimated until the right era is chosen.' }
    ],
    exampleSectionTitle: 'Maytag serial number examples',
    examples: [
      { label: 'Verified dual-era fixture', serial: '12345678WA', note: 'The tested legacy path returns January and 1999/2023; the post-2006 path returns 2013/2043. Era context is required.' },
      { label: 'Verified post-2006-only fixture', serial: 'W10123456', note: 'The pre-2006 ending-code path does not match. The Whirlpool-era path returns candidate years 2011 or 2041.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Laundry products', items: ['Washer lid underside or door opening', 'Dryer door rim or rear cabinet panel'] },
      { title: 'Refrigerators', items: ['Fresh-food compartment wall', 'Behind produce drawers or upper interior trim'] },
      { title: 'Dishwashers and cooking products', items: ['Dishwasher inner frame or tub lip', 'Range or oven frame behind the door or drawer opening'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Use the era selector when it appears because Maytag uses more than one supported serial family.',
      'Bring the model number when the serial alone does not show whether the appliance is legacy or Whirlpool-era.',
      'Try Smart Lookup if the ending characters on an older serial are worn or unreadable.',
      'Do not assume all Maytag products use the same opening year code structure.',
      'Capture the full serial even when the main date clue may be near the end.'
    ],
    faqs: [
      ['Why are pre-2006 and post-2006 Maytag separate?', 'Legacy Maytag and Whirlpool-era Maytag products use different supported code positions. The acquisition-era boundary changes which rule applies.'],
      ['What happens when both Maytag formats match?', 'The interface keeps the combined candidate years and explains both paths. It does not choose one era without evidence.'],
      ['Which characters matter on a legacy Maytag serial?', 'The supported pre-2006 path reads the second-to-last character for year and the last character for month.'],
      ['Which characters matter on a newer Maytag serial?', 'The post-2006 path uses the Whirlpool-family length-dependent year and production-week positions.'],
      ['Can the model number determine the era?', 'It can provide platform and generation evidence, but a model should not be treated as a direct serial manufacture date.'],
      ['Where are Maytag laundry labels located?', 'Official Maytag guidance lists the washer lid/rear control area and dryer door, rear cabinet, or gas-access locations depending on product.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['washer-serial-number', 'Washer Serial Number Lookup'],
      ['dryer-serial-number', 'Dryer Serial Number Lookup'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['kenmore-serial-number-lookup', 'Kenmore'],
      ['ge-serial-number-lookup', 'GE'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'kenmore-serial-number-lookup',
    title: 'Kenmore Serial Number Decoder',
    description: 'Decode Kenmore serial numbers, estimate appliance age, and use the supported OEM-routing logic that depends on the Kenmore model prefix.',
    h1: 'Kenmore Serial Number Decoder',
    badge: 'Brand decoder',
    category: 'appliances',
    brandValue: 'kenmore',
    intro: 'Use this Kenmore serial number decoder when you already know the brand and need the fastest supported path into the correct OEM serial rule.',
    supportingIntro: 'Kenmore does not manufacture its own appliances. The current decoder uses the model prefix to route the serial into Whirlpool, GE, LG, Frigidaire, and other supported OEM logic, then leaves the result estimated when the OEM is not fully confirmed.',
    decoderIntro: 'Kenmore is preselected. Use the full serial and keep the model prefix nearby if possible.',
    decoderPlaceholder: 'Enter Kenmore serial number',
    decodeSectionTitle: 'How to decode a Kenmore serial number',
    decodeSectionBody: 'Kenmore decoding usually starts with the model prefix rather than the serial alone. Once the OEM platform is identified, the serial can follow Whirlpool-family, GE-family, LG-family, or other supported manufacturer logic.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The first three digits of the Kenmore model number are often the key to identifying the actual manufacturer. That is why the model number matters more on Kenmore than it does on many direct-manufacturer brands.',
    formatSectionTitle: 'Common Kenmore serial number formats',
    formats: [
      { label: 'Whirlpool-built Kenmore', pattern: 'Model prefixes such as 106 or 110 often point to Whirlpool-family logic', meaning: 'The serial usually follows the Whirlpool year/week decode path after the OEM is identified.', confidence: 'Estimated until OEM is confirmed.' },
      { label: 'GE-built Kenmore', pattern: 'Prefixes such as 362 or 363 often point to GE-family logic', meaning: 'The serial often follows the GE opening month/year letter pattern after OEM routing.', confidence: 'Estimated until OEM is confirmed.' },
      { label: 'LG-built Kenmore', pattern: 'Prefix 795 commonly points to LG-family refrigerator logic', meaning: 'The serial often follows the LG year-digit-plus-month pattern once the OEM is identified.', confidence: 'Estimated until OEM is confirmed.' }
    ],
    exampleSectionTitle: 'Kenmore serial number examples',
    examples: [
      { label: 'Verified LG-built Kenmore route', serial: '795.74053.410 + 410KR00219', note: 'Prefix 795 selects LG logic. The serial returns October and candidate years 2004, 2014, or 2024.' },
      { label: 'Verified Samsung-family serial fixture', serial: 'A00843ESC00128', note: 'The supported Samsung path returns December with candidate years 2009 or 2029; the OEM must be established before applying that rule.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Refrigerators', items: ['Inside the fresh-food compartment wall', 'Keep the model prefix visible because OEM routing often depends on it'] },
      { title: 'Laundry products', items: ['Door opening or lid rim for the serial tag', 'Use the model prefix with the serial for best Kenmore results'] },
      { title: 'Dishwashers and ranges', items: ['Frame edge, tub lip, or oven opening', 'Capture both model and serial if the unit is private-label or older'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Add the model prefix because Kenmore routing often depends on the OEM manufacturer.',
      'Do not assume Kenmore uses one universal serial system across all appliances.',
      'Try Smart Lookup if the model prefix is missing or unreadable.',
      'Use product category to avoid mixing refrigerator, laundry, and cooking-family assumptions.',
      'Capture the full serial even if the OEM path is not known yet.'
    ],
    faqs: [
      ['Why is Kenmore not decoded with one brand-wide rule?', 'Kenmore products were built by multiple OEMs. The model prefix determines which manufacturer family is the appropriate serial path.'],
      ['What does Kenmore prefix 795 mean in this tool?', 'It routes the appliance to the supported LG-family decoder. The full model and serial should still be retained.'],
      ['What happens when no Kenmore prefix is available?', 'The current interface permits a documented Whirlpool-family fallback, but labels the OEM assumption. Smart Lookup is safer when the prefix can be recovered.'],
      ['Is a Kenmore model prefix always the first three digits?', 'The supported helper extracts the first three digits from a complete model such as 795.74053.410. Do not use three digits copied from an unrelated label field.'],
      ['Why can a correctly routed Kenmore result still show several years?', 'OEM formats such as LG, GE, Whirlpool, and Samsung can reuse year codes. Correct routing does not remove that separate cycle ambiguity.'],
      ['Where can I verify the complete Kenmore model?', 'Use the product label and Kenmore manual lookup. The manual search requires the model identifier, not the serial number.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['ge-serial-number-lookup', 'GE'],
      ['lg-serial-number-lookup', 'LG'],
      ['frigidaire-serial-number-lookup', 'Frigidaire'],
      ['find-model-serial-number', 'Find Model & Serial Labels'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    preGridSections: [
      {
        type: 'table',
        id: 'kenmore-worked-example',
        title: 'Worked Kenmore OEM-routing example',
        intro: 'The model prefix selects the decoder; the serial then supplies the date positions.',
        rows: [
          { field: 'Model 795.74053.410', meaning: 'Prefix 795', why: 'The tested routing helper identifies an LG-built Kenmore refrigerator.' },
          { field: 'Serial 410KR00219', meaning: 'LG year digit 4; month 10', why: 'The decoder returns October with candidate years 2004, 2014, or 2024.' },
          { field: 'No additional model-era evidence', meaning: 'All three years remain', why: 'OEM routing identifies the rule but does not automatically resolve a repeating decade.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'kenmore-fallback-limit',
        title: 'What the no-prefix fallback does and does not prove',
        body: [
          'The current interface allows decoding without a model prefix and uses a documented Whirlpool-family fallback so the tool remains usable. That fallback is an assumption about OEM routing, not proof that Whirlpool built the unit.',
          'For an approval-facing result, recover the full model from the label, manual, registration, or Smart Lookup whenever possible and record whether the OEM was confirmed or assumed.'
        ]
      },
      {
        type: 'raw',
        html: `
<div class="bp-content-wrap" style="padding-bottom:0;padding-top:4px;">
  <div class="bp-section-card bp-full-width kenmore-prefix-section">
    <div class="bp-section-card-head">
      <span class="material-symbols-outlined bp-section-icon" style="color:#44e5c2;">table_view</span>
      <h2>Kenmore Model Prefix → OEM Manufacturer</h2>
    </div>
    <p style="color:#bacac3;font-size:14px;margin-bottom:20px;line-height:1.7;">
      Kenmore appliances are built by other manufacturers. Find your model prefix below to identify the right decoder path.
      The prefix is the <strong style="color:#dae2fd;">first 3 digits</strong> of your model number (e.g., model <code class="kp-inline-code">110.12345678</code> → prefix <code class="kp-inline-code">110</code>).
    </p>
    <div class="kp-grid">
      <div class="kp-group">
        <div class="kp-group-head" style="color:#44e5c2;border-color:#44e5c240;">
          <span class="material-symbols-outlined" style="font-size:18px;">kitchen</span>
          Whirlpool-built
        </div>
        <div class="kp-chips">
          <span class="kp-chip" data-prefix="106" data-oem="whirlpool"><strong>106</strong> · Fridge</span>
          <span class="kp-chip" data-prefix="110" data-oem="whirlpool"><strong>110</strong> · Laundry</span>
          <span class="kp-chip" data-prefix="198" data-oem="whirlpool"><strong>198</strong> · Various</span>
          <span class="kp-chip" data-prefix="562" data-oem="whirlpool"><strong>562</strong> · Various</span>
          <span class="kp-chip" data-prefix="665" data-oem="whirlpool"><strong>665</strong> · Dishwasher</span>
        </div>
      </div>
      <div class="kp-group">
        <div class="kp-group-head" style="color:#ffc278;border-color:#ffc27840;">
          <span class="material-symbols-outlined" style="font-size:18px;">bolt</span>
          GE-built
        </div>
        <div class="kp-chips">
          <span class="kp-chip" data-prefix="362" data-oem="ge"><strong>362</strong> · Range</span>
          <span class="kp-chip" data-prefix="363" data-oem="ge"><strong>363</strong> · Fridge</span>
        </div>
      </div>
      <div class="kp-group">
        <div class="kp-group-head" style="color:#9fcaff;border-color:#9fcaff40;">
          <span class="material-symbols-outlined" style="font-size:18px;">ac_unit</span>
          LG-built
        </div>
        <div class="kp-chips">
          <span class="kp-chip" data-prefix="795" data-oem="lg"><strong>795</strong> · Fridge</span>
        </div>
      </div>
      <div class="kp-group">
        <div class="kp-group-head" style="color:#bacac3;border-color:#bacac340;">
          <span class="material-symbols-outlined" style="font-size:18px;">category</span>
          Other Manufacturers
        </div>
        <div class="kp-chips">
          <span class="kp-chip" data-prefix="596" data-oem="amana"><strong>596</strong> · Amana</span>
          <span class="kp-chip" data-prefix="253" data-oem="gibson"><strong>253</strong> · Gibson</span>
          <span class="kp-chip" data-prefix="417" data-oem="kelvinator"><strong>417</strong> · Kelvinator</span>
          <span class="kp-chip" data-prefix="628" data-oem="kelvinator"><strong>628</strong> · Kelvinator</span>
          <span class="kp-chip" data-prefix="662" data-oem="kelvinator"><strong>662</strong> · Kelvinator</span>
          <span class="kp-chip" data-prefix="103" data-oem="roper"><strong>103</strong> · Roper</span>
          <span class="kp-chip" data-prefix="155" data-oem="roper"><strong>155</strong> · Roper</span>
          <span class="kp-chip" data-prefix="278" data-oem="roper"><strong>278</strong> · Roper</span>
          <span class="kp-chip" data-prefix="647" data-oem="roper"><strong>647</strong> · Roper</span>
          <span class="kp-chip" data-prefix="174" data-oem="caloric"><strong>174</strong> · Caloric</span>
          <span class="kp-chip" data-prefix="629" data-oem="jenn-air"><strong>629</strong> · Jenn-Air</span>
          <span class="kp-chip" data-prefix="651" data-oem="speed-queen"><strong>651</strong> · Speed Queen</span>
          <span class="kp-chip" data-prefix="791" data-oem="tappan"><strong>791</strong> · Tappan</span>
        </div>
      </div>
    </div>
    <p class="kp-hint">
      <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;color:#44e5c2;">info</span>
      Select a prefix chip above to auto-fill the decoder, or use the dropdown that appears when Kenmore is selected in the decoder tool below.
    </p>
  </div>
</div>`
      }
    ],
    pageScript: `
      // ── Kenmore prefix chip click handler ──────────────────────────
      document.querySelectorAll('.kp-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
          var prefix = this.dataset.prefix;
          document.querySelectorAll('.kp-chip').forEach(function(c) { c.classList.remove('kp-chip-active'); });
          this.classList.add('kp-chip-active');
          // Fill the model prefix field (text input or select)
          var prefixField = document.getElementById('kenmoreModelPrefix');
          if (prefixField) {
            prefixField.value = prefix;
            prefixField.dispatchEvent(new Event('input', { bubbles: true }));
            prefixField.dispatchEvent(new Event('change', { bubbles: true }));
          }
          // Scroll to decoder
          var tool = document.getElementById('decoder-tool');
          if (tool) tool.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      // ── Convert kenmoreModelPrefix text input → styled select ──────
      var KENMORE_PREFIXES = [
        { value: '',    label: '— Select model prefix —', group: '' },
        { value: '106', label: '106 · Whirlpool (Refrigerator)',    group: 'Whirlpool-built' },
        { value: '110', label: '110 · Whirlpool (Laundry)',         group: 'Whirlpool-built' },
        { value: '198', label: '198 · Whirlpool (Various)',         group: 'Whirlpool-built' },
        { value: '562', label: '562 · Whirlpool (Various)',         group: 'Whirlpool-built' },
        { value: '665', label: '665 · Whirlpool (Dishwasher)',      group: 'Whirlpool-built' },
        { value: '362', label: '362 · General Electric (Range)',    group: 'GE-built' },
        { value: '363', label: '363 · General Electric (Fridge)',   group: 'GE-built' },
        { value: '795', label: '795 · LG (Refrigerator)',           group: 'LG-built' },
        { value: '596', label: '596 · Amana',                       group: 'Other' },
        { value: '253', label: '253 · Gibson',                      group: 'Other' },
        { value: '417', label: '417 · Kelvinator',                  group: 'Other' },
        { value: '628', label: '628 · Kelvinator',                  group: 'Other' },
        { value: '662', label: '662 · Kelvinator',                  group: 'Other' },
        { value: '103', label: '103 · Roper',                       group: 'Other' },
        { value: '155', label: '155 · Roper',                       group: 'Other' },
        { value: '278', label: '278 · Roper',                       group: 'Other' },
        { value: '647', label: '647 · Roper',                       group: 'Other' },
        { value: '174', label: '174 · Caloric',                     group: 'Other' },
        { value: '629', label: '629 · Jenn-Air',                    group: 'Other' },
        { value: '651', label: '651 · Speed Queen',                  group: 'Other' },
        { value: '791', label: '791 · Tappan',                      group: 'Other' },
      ];

      function buildPrefixSelect(originalInput) {
        var groups = {};
        KENMORE_PREFIXES.forEach(function(p) {
          if (!groups[p.group]) groups[p.group] = [];
          groups[p.group].push(p);
        });

        var sel = document.createElement('select');
        sel.id = originalInput.id;   // keep same ID so script.js finds it
        sel.className = originalInput.className + ' kenmore-prefix-select';
        sel.setAttribute('aria-label', 'Kenmore model prefix');

        // blank option
        var blank = document.createElement('option');
        blank.value = '';
        blank.textContent = '— Select model prefix —';
        sel.appendChild(blank);

        var groupOrder = ['Whirlpool-built', 'GE-built', 'LG-built', 'Other'];
        groupOrder.forEach(function(gName) {
          if (!groups[gName] || !groups[gName].length) return;
          var og = document.createElement('optgroup');
          og.label = gName;
          groups[gName].forEach(function(p) {
            var opt = document.createElement('option');
            opt.value = p.value;
            opt.textContent = p.label;
            og.appendChild(opt);
          });
          sel.appendChild(og);
        });

        // keep existing value if any
        sel.value = originalInput.value || '';

        sel.addEventListener('change', function() {
          originalInput.dispatchEvent(new Event('change', { bubbles: true }));
          // sync chip highlight
          document.querySelectorAll('.kp-chip').forEach(function(c) {
            c.classList.toggle('kp-chip-active', c.dataset.prefix === sel.value);
          });
          if (typeof updateDecodeBtn === 'function') updateDecodeBtn();
        });

        return sel;
      }

      function upgradeKenmoreInput() {
        var el = document.getElementById('kenmoreModelPrefix');
        if (!el || el.tagName === 'SELECT') return;
        var parent = el.parentNode;
        var sel = buildPrefixSelect(el);
        parent.replaceChild(sel, el);
      }

      // Watch for the field to appear (it's injected dynamically when brand = kenmore)
      var kenmoreObserver = new MutationObserver(function() {
        upgradeKenmoreInput();
      });
      kenmoreObserver.observe(document.body, { childList: true, subtree: true });
      // Also try immediately in case it's already there
      upgradeKenmoreInput();
    `,
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'carrier-serial-number-lookup',
    title: 'Carrier Serial Number Decoder',
    description: 'Decode Carrier serial numbers, estimate HVAC age, and use the supported Carrier year-position logic with concise rating-plate guidance.',
    htmlTitleOverride: 'Carrier Serial Number Lookup — HVAC Age & Manufacture Date | Decode My Item',
    metaDescriptionOverride: 'Look up Carrier serial numbers to find the manufacture date, HVAC age, and production year. Supports Carrier air conditioners, furnaces, and heat pumps. Free and instant.',
    h1: 'Carrier Serial Number Decoder',
    badge: 'HVAC brand decoder',
    category: 'hvac',
    brandValue: 'carrier',
    intro: 'Use this Carrier serial number decoder when you already know the brand and want the fastest supported HVAC age path from the rating plate.',
    supportingIntro: 'Carrier serial formats are brand-specific HVAC paths. The current decoder supports the common Carrier year-position logic and keeps the result focused on rating-plate serial research instead of generic model-number guesses.',
    decoderIntro: 'Carrier is preselected. Enter the full HVAC serial number exactly as printed on the rating plate.',
    decoderPlaceholder: 'Enter Carrier serial number',
    decodeSectionTitle: 'How to decode a Carrier serial number',
    decodeSectionBody: 'Supported Carrier serial decoding commonly uses digits 3-4 as the production year. Depending on the exact family, surrounding digits may track week, plant, or production sequence rather than a direct month.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The Carrier model number helps confirm equipment family and product generation. That becomes useful when the serial fits a supported year position but you still need model-era context for a stronger replacement or claim summary.',
    preGridSections: [
      {
        type: 'table',
        id: 'carrier-worked-examples',
        title: 'Worked Carrier serial examples',
        intro: 'The supported Carrier path validates digits 1-2 as a week number (1-53) and reads digits 3-4 as the production year.',
        rows: [
          { field: 'Digits 1-2 of 1419XXXX', meaning: 'Week code "14" (valid: 1-53)', why: 'Confirms the opening digits look like a genuine Carrier rating-plate serial before the year is read.' },
          { field: 'Digits 3-4 of 1419XXXX', meaning: 'Year code "19"', why: '19 is 50 or under, so it resolves to 2019. Result: 2019 (year only; this format does not resolve a month).' },
          { field: 'Digits 1-2 of 0892XXXX', meaning: 'Week code "08" (valid: 1-53)', why: 'Confirms the format before the year is read.' },
          { field: 'Digits 3-4 of 0892XXXX', meaning: 'Year code "92"', why: '92 is over 50, so the supported path resolves it to 1992 instead of 2092. Result: 1992.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'why-carrier-varies',
        title: 'Why Carrier-family serials can vary',
        body: [
          'Carrier, Bryant, and Payne share the same parent company, and related HVAC brands can use similar digit-position conventions. The supported logic on this page is specific to Carrier-branded rating plates &mdash; a visually similar serial on a different badge is not guaranteed to follow the identical rule, so use the brand printed on the equipment rather than assuming every Carrier-family badge decodes identically.',
          'Plant, product line, and era can also affect which digits carry meaningful information beyond the year. When the serial does not match the supported digits-3-4-year pattern, treat the result as unsupported rather than guessing at a different position.'
        ]
      },
      {
        type: 'copy-block',
        id: 'carrier-multiple-years',
        title: 'Does a Carrier serial show more than one possible year?',
        body: [
          'No &mdash; unlike some appliance brands, the supported Carrier serial format does not use a repeating year cycle, so a successful decode resolves to a single year rather than a list of candidates.',
          'When Carrier decoding does not produce a result, it is usually because the input failed a validation check rather than because of year ambiguity: the current logic rejects a week code outside 1-53, and it rejects a resulting year that would fall more than a couple of years in the future. In those cases, double-check the serial against the rating plate or try Smart Lookup rather than assuming the equipment is simply too new or too old to support.'
        ]
      },
      {
        type: 'copy-block',
        id: 'carrier-model-tonnage',
        title: 'Model number and tonnage context',
        body: [
          'The serial number is what this decoder reads for manufacture year. The model number is a separate identifier for equipment family and generation &mdash; this site does not currently decode tonnage or capacity from a Carrier model number.',
          'For tonnage or capacity details, check the equipment nameplate directly. Use the serial for age and the model number for product/capacity research as two separate signals rather than combining them into a single reading.'
        ]
      }
    ],
    formatSectionTitle: 'Common Carrier serial number formats',
    formats: [
      { label: 'Carrier condenser and heat-pump serials', pattern: 'Digits 3-4 commonly map the year', meaning: 'The current decoder uses the supported Carrier year position rather than a generic appliance-style month code.', confidence: 'Moderate to high confidence when the label matches the supported format.' },
      { label: 'Carrier furnaces', pattern: 'Digits 3-4 commonly map the year', meaning: 'Furnaces often follow the same supported Carrier year position.', confidence: 'Moderate to high confidence.' },
      { label: 'Carrier indoor units', pattern: 'Same supported year position', meaning: 'Air handlers and other indoor units often use the same main year placement.', confidence: 'Moderate to high confidence.' }
    ],
    exampleSectionTitle: 'Carrier serial number examples',
    examples: [
      { label: 'Illustrative Carrier pattern', serial: 'XX19XXXXX', note: 'Illustrative Carrier-family pattern. The supported path focuses on digits 3-4 for the production year.' },
      { label: 'Rating-plate reminder', serial: 'Full serial required', note: 'Capture the full rating-plate serial even when the key year signal appears early in the code.' },
      { label: 'HVAC context reminder', serial: 'Model family still helps', note: 'The model number helps verify the product generation and supports replacement research after the serial date is estimated.' },
      { label: 'Worked example', serial: '1419XXXX', note: 'Digits 1-2 (14) validate as a week number, and digits 3-4 (19) resolve to year 2019. This format returns a year only, not a month.' },
      { label: 'Worked example (older unit)', serial: '0892XXXX', note: 'Digits 3-4 (92) fall above the 50 pivot, so the supported logic resolves this to 1992 rather than 2092.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Outdoor condensers and heat pumps', items: ['Side cabinet rating plate near service valves', 'Exterior panel near refrigerant line connections'] },
      { title: 'Furnaces', items: ['Inside the front service door', 'Side cabinet rating plate near burner or blower area'] },
      { title: 'Air handlers and indoor units', items: ['Access panel or blower compartment sticker', 'Exterior cabinet label near electrical data'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Use the full rating-plate serial instead of a partial photo or handwritten note.',
      'Make sure the product is Carrier-family equipment and not just a similar private-label unit.',
      'Use the model number to confirm the family when the serial year is clear but the product generation is not.',
      'Try Smart Lookup if the label is damaged or if the serial does not match the supported Carrier family pattern.',
      'Do not apply appliance-style month/year rules to HVAC equipment.',
      'Check the opening two digits: the supported path rejects a week code outside 1-53 rather than guessing at a year.',
      'A model number alone, without a serial, cannot produce a manufacture date here &mdash; try Smart Lookup for model-only research.'
    ],
    faqs: [
      ['How old is my Carrier unit?', 'Use the serial number from the rating plate. The supported Carrier path commonly reads digits 3-4 as the production year.'],
      ['Can the Carrier model number tell me the age?', 'Not as directly as the serial number. It is better for identifying the family and supporting replacement research.'],
      ['Why does my Carrier serial number not decode?', 'The label may be partial, the product may follow a different family, or the serial may fall outside the supported Carrier path.'],
      ['Where is the Carrier serial number plate located?', 'Most Carrier equipment places it on the outdoor cabinet, indoor access panel, or furnace service area depending on product type.'],
      ['Can this support claim documentation?', 'Yes. Serial-based age support is useful for HVAC claims, especially when the rating plate photo is saved with the file.'],
      ['What date does a Carrier serial number show?', 'The supported Carrier path resolves to a single production year read from digits 3-4. It does not resolve a month on this format.'],
      ['Is there a Carrier model number lookup?', 'This page focuses on serial-based age decoding. The model number is best used alongside the serial to confirm equipment family rather than as a stand-alone age lookup.'],
      ['Does the Carrier model number tell me the tonnage?', 'This site does not decode tonnage or capacity from the model number. Check the equipment nameplate for tonnage details.'],
      ['What if my Carrier serial is unsupported?', 'Confirm the full serial matches the rating plate, verify the opening two digits form a valid week number (1-53), and try Smart Lookup if the format still does not resolve.']
    ],
    relatedLinks: [
      ['how-old-is-my-hvac', 'How Old Is My HVAC?'],
      ['trane-serial-number-lookup', 'Trane'],
      ['rheem-serial-number-lookup', 'Rheem'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['smart-lookup', 'Smart Lookup'],
      ['serial-number-location-guide', 'Serial Number Location Guide'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'trane-serial-number-lookup',
    title: 'Trane Serial Number Decoder',
    description: 'Check the supported modern numeric Trane HVAC serial path, read the year from digits 3-4, and recover model/nameplate context when the format differs.',
    h1: 'Trane Serial Number Decoder',
    badge: 'HVAC brand decoder',
    category: 'hvac',
    brandValue: 'trane',
    intro: 'Use this Trane serial number decoder when you already know the brand and want the fastest supported HVAC age path from the rating plate.',
    supportingIntro: 'The current decoder supports a bounded modern numeric path, not every historical Trane serial era. It validates the opening week-shaped digits and reads digits 3-4 as year when the rating-plate string matches that structure.',
    decoderIntro: 'Trane is preselected. Enter the full HVAC serial number exactly as printed on the rating plate.',
    decoderPlaceholder: 'Enter Trane serial number',
    decodeSectionTitle: 'How to decode a Trane serial number',
    decodeSectionBody: 'The supported numeric Trane path requires two valid opening digits in the 01-53 range and reads digits 3-4 as the two-digit production year. The current output is year-only; it does not claim an exact month or day.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model identifies the component and equipment family. It is useful for manuals, warranty records, and replacement research, but this page does not decode tonnage or manufacture date from the model.',
    preGridSections: [
      {
        type: 'table',
        id: 'trane-worked-example',
        title: 'Verified Trane format example',
        intro: 'This sanitized fixture exercises the supported numeric path and its validation boundaries.',
        rows: [
          { field: 'Serial 1427XXXXXX', meaning: 'Opening 14; year code 27', why: 'The opening value passes the 01-53 format check and digits 3-4 resolve to 2027 under the current one-year future tolerance.' },
          { field: 'Serial AB1234567', meaning: 'Does not match numeric opening', why: 'The decoder rejects it rather than misreading digits later in the string as 2012.' },
          { field: 'Serial 1234567890', meaning: 'Would imply 2034', why: 'The decoder rejects a year beyond its supported future tolerance.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'trane-supported-boundary',
        title: 'What this Trane page does not cover',
        body: [
          'Trane has used more than one identifier style across product families and eras. A nameplate that does not begin with the supported numeric structure should be treated as unsupported here, not reshaped to fit the example.',
          'Use the complete model and serial from each HVAC component. Trane registration and warranty support treat those as separate identifiers, and indoor and outdoor units may need to be researched individually.'
        ]
      }
    ],
    formatSectionTitle: 'Common Trane serial number formats',
    formats: [
      { label: 'Trane condensers and heat pumps', pattern: 'Digits 3-4 commonly map the year', meaning: 'The current decoder uses the supported Trane year position instead of a generic month-year guess.', confidence: 'Moderate to high confidence when the label matches the supported path.' },
      { label: 'Trane furnaces', pattern: 'Digits 3-4 commonly map the year', meaning: 'Furnaces often follow the same supported Trane year placement.', confidence: 'Moderate to high confidence.' },
      { label: 'Trane indoor units', pattern: 'Same supported year position', meaning: 'Air handlers and indoor units often use the same year-position logic.', confidence: 'Moderate to high confidence.' }
    ],
    exampleSectionTitle: 'Trane serial number examples',
    examples: [
      { label: 'Verified supported fixture', serial: '1427XXXXXX', note: 'The current Trane regression reads digits 3-4 as 27 and returns 2027. It does not claim a month.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Outdoor condensers and heat pumps', items: ['Side cabinet rating plate near service valves', 'Exterior panel near refrigerant line connections'] },
      { title: 'Furnaces', items: ['Inside the front service door', 'Side cabinet plate near burner or blower area'] },
      { title: 'Air handlers and indoor units', items: ['Access panel or blower compartment label', 'Exterior cabinet sticker near electrical specs'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Use the full rating-plate serial rather than a partial copied string.',
      'Confirm that the product is Trane-family equipment before assuming the supported year position.',
      'Use the model number to confirm the family after the year is estimated.',
      'Try Smart Lookup if the label is damaged or if the serial does not match the supported Trane structure.',
      'Do not apply appliance-style month/year rules to HVAC serials.'
    ],
    faqs: [
      ['Which Trane format is supported here?', 'The current path expects an opening four-digit numeric group, validates the first two digits, and reads digits 3-4 as year.'],
      ['Does the supported Trane result include a production week?', 'No. The opening digits are validated as part of the supported structure, but the current Trane result is year-only.'],
      ['Why is an alphabetic Trane serial rejected?', 'It falls outside this bounded numeric path. The tool does not scan later digits and invent a year.'],
      ['Should I combine indoor and outdoor unit serials?', 'No. Photograph and research each component nameplate separately because a split system can contain components from different production dates.'],
      ['Where does Trane say to find the serial?', 'Trane identifies the unit nameplate, metal tag, or sticker as the source for registration identifiers.'],
      ['What should I do with an older unsupported Trane format?', 'Keep the full model and serial, check official warranty or manual records, or use Smart Lookup without forcing it into the modern numeric rule.']
    ],
    relatedLinks: [
      ['how-old-is-my-hvac', 'How Old Is My HVAC?'],
      ['how-to-find-hvac-age', 'How to Find HVAC Age'],
      ['hvac-age-by-serial-number', 'HVAC Age by Serial Number'],
      ['carrier-serial-number-lookup', 'Carrier'],
      ['rheem-serial-number-lookup', 'Rheem'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'rheem-serial-number-lookup',
    title: 'Rheem HVAC Serial Number Decoder',
    description: 'Decode the supported Rheem HVAC letter-plus-WWYY serial format. Water-heater users are directed to the separate water-heater workflow.',
    h1: 'Rheem HVAC Serial Number Decoder',
    badge: 'HVAC brand decoder',
    category: 'hvac',
    brandValue: 'rheem',
    intro: 'Use this route only for Rheem heating and cooling equipment. Rheem water heaters use separate serial styles and should be researched through the existing water-heater guide.',
    supportingIntro: 'The supported HVAC path reads a letter followed by a WWYY block. It must not be mixed with Rheem water-heater formats such as MMYY, embedded WWYY, or plant-prefix styles.',
    decoderIntro: 'Rheem is preselected. Enter the full HVAC serial number exactly as printed on the rating plate.',
    decoderPlaceholder: 'Enter Rheem HVAC serial number',
    decodeSectionTitle: 'How to decode a Rheem serial number',
    decodeSectionBody: 'Supported Rheem HVAC serial decoding commonly looks for a four-digit week/year block after an opening letter. In many supported cases, the first two digits of that block point to production week and the next two point to year.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The HVAC model identifies component family and supports manual, capacity, and replacement research. This page does not infer tonnage or date from the model number.',
    preGridSections: [
      {
        type: 'table',
        id: 'rheem-hvac-worked-example',
        title: 'Verified Rheem HVAC example',
        intro: 'The current HVAC regression distinguishes this path from Rheem water-heater parsing.',
        rows: [
          { field: 'Serial X4502XXXX', meaning: 'Opening letter X; WWYY block 4502', why: 'The supported Rheem HVAC decoder returns production week 45 of 2002.' },
          { field: 'Serial GM028928Q', meaning: 'GE refrigerator-style string', why: 'The Rheem HVAC decoder rejects it rather than scanning for an unrelated year-looking pair.' },
          { field: 'Water heater 1291A39968', meaning: 'MMYY water-heater style', why: 'This belongs to the water-heater decoder and resolves there to December 1991; it is intentionally not this page\'s HVAC example.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'rheem-category-boundary',
        title: 'Choose Rheem HVAC or water heating before decoding',
        body: [
          'Rheem manufactures both heating-and-cooling equipment and water heaters, but the supported serial rules are category-specific. This page preselects HVAC and uses only the HVAC letter-plus-WWYY path.',
          'For a tank, tankless, or hybrid water heater, use the <a href="/how-old-is-my-plumbing">water-heater age guide</a>. Rheem\'s official water-heater documentation describes a ten-digit rating-label serial with its own month/year interpretation.'
        ]
      }
    ],
    formatSectionTitle: 'Common Rheem serial number formats',
    formats: [
      { label: 'Rheem HVAC serials', pattern: 'Letter + WWYY block', meaning: 'The supported path often reads the first four digits after an opening letter as production week and year.', confidence: 'Moderate to high confidence when the label matches the supported path.' },
      { label: 'Rheem indoor and outdoor equipment', pattern: 'Same week/year block logic', meaning: 'Air conditioners, heat pumps, and indoor units often follow the same supported week/year structure.', confidence: 'Moderate to high confidence.' },
      { label: 'Rheem product-family reminder', pattern: 'Full serial still matters', meaning: 'The opening letter and full rating-plate string help confirm you are using the right supported Rheem path.', confidence: 'High confidence on workflow.' }
    ],
    exampleSectionTitle: 'Rheem serial number examples',
    examples: [
      { label: 'Verified Rheem HVAC fixture', serial: 'X4502XXXX', note: 'The supported letter-plus-WWYY path returns week 45 of 2002.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Outdoor condensers and heat pumps', items: ['Side cabinet rating plate near service valves', 'Exterior panel near refrigerant line connections'] },
      { title: 'Furnaces and air handlers', items: ['Inside the access panel or service door', 'Exterior cabinet sticker near electrical data'] },
      { title: 'Documentation fallback', items: ['Installation paperwork if the rating plate is worn', 'Service records or equipment inventory files'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Use the full rating-plate serial instead of a partial typed string.',
      'Confirm that the unit is on the HVAC path rather than a water-heater-only product family.',
      'Use the model number to support replacement planning after the age estimate is returned.',
      'Try Smart Lookup if the week/year block is unreadable or if the label is damaged.',
      'Do not mix water-heater Rheem formats with HVAC Rheem formats.'
    ],
    faqs: [
      ['Is this page for Rheem water heaters?', 'No. It preselects Rheem HVAC. Use the water-heater guide for tank, tankless, and hybrid units.'],
      ['What does WWYY mean on the supported HVAC path?', 'The two week digits come before the two year digits after the opening letter. X4502 therefore means week 45 of 2002.'],
      ['Why does a valid Rheem water-heater serial fail here?', 'The categories use different decoders. A water-heater MMYY or embedded-WWYY format should not be sent through the HVAC rule.'],
      ['Where is a Rheem split-system label?', 'Rheem identifies the back of the outdoor unit and the inside front cover of the indoor unit as model/serial locations.'],
      ['Should indoor and outdoor components be researched separately?', 'Yes. Record the model and serial from each component rather than assuming the complete system shares one production date.'],
      ['What if the HVAC serial is not letter plus WWYY?', 'Treat it as unsupported on this route and use official records or Smart Lookup. Do not rearrange characters to fit the example.']
    ],
    relatedLinks: [
      ['how-old-is-my-hvac', 'How Old Is My HVAC?'],
      ['how-to-find-hvac-age', 'How to Find HVAC Age'],
      ['hvac-age-by-serial-number', 'HVAC Age by Serial Number'],
      ['carrier-serial-number-lookup', 'Carrier'],
      ['trane-serial-number-lookup', 'Trane'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['how-old-is-my-plumbing', 'Rheem Water Heater Age Guide'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'goodman-serial-number-lookup',
    title: 'Goodman Serial Number Decoder',
    description: 'Decode Goodman serial numbers, estimate HVAC age, and use the supported Goodman year/month format with concise rating-plate guidance.',
    htmlTitleOverride: 'Goodman Serial Number Lookup — HVAC Age & Manufacture Date | Decode My Item',
    metaDescriptionOverride: 'Decode Goodman serial numbers to find AC unit, furnace, or heat pump manufacture year. Supports all Goodman HVAC equipment. Useful for insurance claims and HVAC replacement decisions.',
    h1: 'Goodman Serial Number Decoder',
    badge: 'HVAC brand decoder',
    category: 'hvac',
    brandValue: 'goodman',
    intro: 'Use this Goodman serial number decoder when you already know the brand and want the fastest supported HVAC age path from the rating plate.',
    supportingIntro: 'Goodman is one of the clearer HVAC decode paths in the current data. The supported logic commonly reads the first two serial digits as year and the next two as month.',
    decoderIntro: 'Goodman is preselected. Enter the full HVAC serial number exactly as printed on the rating plate.',
    decoderPlaceholder: 'Enter Goodman serial number',
    howToSteps: [
      'Choose the Goodman HVAC path.',
      'Enter the full serial number from the equipment data plate.',
      'Review the supported year/month estimate and related HVAC links.'
    ],
    decodeSectionTitle: 'How to decode a Goodman serial number',
    decodeSectionBody: 'Supported Goodman HVAC serial decoding commonly uses the first two digits for year and the next two digits for month. That makes Goodman one of the clearer HVAC date paths on the site.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The Goodman model number helps confirm equipment family and replacement class. It is useful for downstream replacement research even when the serial result itself is relatively direct.',
    preGridSections: [
      {
        type: 'copy-block',
        id: 'how-old-is-my-goodman-unit',
        title: 'How old is my Goodman unit?',
        body: [
          'Goodman HVAC serial numbers typically open with four digits: the first two are the production year and the next two are the production month. That opening YYMM group is the primary age signal &mdash; the remaining characters are usually plant or production-sequence tracking rather than date information.',
          'Because the year is read directly from the serial rather than from a repeating letter or digit cycle, a Goodman result is usually a single year rather than a list of candidate years. The model number is still useful context: it can confirm the equipment family and help with replacement research, and it can flag a serial that does not look like a genuine Goodman or Amana rating-plate number.'
        ]
      },
      {
        type: 'table',
        id: 'goodman-worked-examples',
        title: 'Worked Goodman serial examples',
        intro: 'Both examples below use the supported YYMM opening pattern.',
        rows: [
          { field: 'Digits 1-2 of 1908123456', meaning: 'Year code "19"', why: 'Resolves to 2019. No ambiguity: Goodman does not use a repeating year cycle.' },
          { field: 'Digits 3-4 of 1908123456', meaning: 'Month code "08"', why: 'Resolves to August, giving a full result of August 2019.' },
          { field: 'Digits 1-2 of 1404123456', meaning: 'Year code "14"', why: 'Resolves to 2014.' },
          { field: 'Digits 3-4 of 1404123456', meaning: 'Month code "04"', why: 'Resolves to April, giving a full result of April 2014.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'model-tonnage-context',
        title: 'Model number and tonnage context',
        body: [
          'The serial number is what this decoder reads for manufacture date. The model number is a separate identifier for equipment family and capacity &mdash; some Goodman/Amana model numbers include a capacity or tonnage code as part of the manufacturer\'s naming convention, but this site does not currently decode tonnage or BTU capacity from the model number.',
          'If you need tonnage or capacity information, check the equipment nameplate directly or use <a href="/smart-lookup">Smart Lookup</a> for model-focused research, and treat any tonnage figure from the model number as separate from, and not a substitute for, the serial-based age result.'
        ]
      }
    ],
    formatSectionTitle: 'Common Goodman serial number formats',
    formats: [
      { label: 'Goodman condensers and heat pumps', pattern: 'Year in digits 1-2; month in digits 3-4', meaning: 'The supported path reads the opening four digits directly as year and month.', confidence: 'Higher confidence when the serial matches the supported pattern.' },
      { label: 'Goodman furnaces', pattern: 'Same opening year/month logic', meaning: 'Furnaces often follow the same supported Goodman date structure.', confidence: 'Higher confidence.' },
      { label: 'Goodman air handlers and package units', pattern: 'Same opening year/month logic', meaning: 'Indoor and packaged equipment often use the same supported opening positions.', confidence: 'Higher confidence.' }
    ],
    exampleSectionTitle: 'Goodman serial number examples',
    examples: [
      { label: 'Illustrative Goodman pattern', serial: '1911XXXXX', note: 'Illustrative Goodman-family pattern. The supported path treats 19 as year and 11 as month when the serial matches this structure.' },
      { label: 'Direct-date reminder', serial: 'YYMM opening', note: 'Goodman is stronger than many HVAC brands because the supported serial structure can resolve to a more direct year/month reading.' },
      { label: 'Rating-plate reminder', serial: 'Full serial required', note: 'Capture the full serial anyway because the complete label still helps with replacement and claim documentation.' },
      { label: 'Worked example', serial: '1908123456', note: 'Digits 1-2 (19) resolve to year 2019, and digits 3-4 (08) resolve to month August, giving a full result of August 2019.' },
      { label: 'Worked example', serial: '1404123456', note: 'Digits 1-2 (14) resolve to year 2014, and digits 3-4 (04) resolve to month April, giving a full result of April 2014.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Outdoor condensers and heat pumps', items: ['Side cabinet data plate near service lines', 'Exterior panel near refrigerant connections'] },
      { title: 'Furnaces', items: ['Inside the front service panel', 'Side cabinet label near burner or blower area'] },
      { title: 'Air handlers and package units', items: ['Access panel or blower compartment sticker', 'Exterior cabinet label near electrical data'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Use the full rating-plate serial instead of a partial copied string.',
      'Make sure you are reading the opening digits correctly because they carry the supported Goodman year/month logic.',
      'Use the model number for replacement-family research after the age estimate is returned.',
      'Try Smart Lookup if the data plate is damaged or if the serial does not match the supported Goodman structure.',
      'Do not apply appliance-style serial logic to HVAC equipment.',
      'Double-check for transcription mistakes (a misread 0/O, 1/I, or 8/B) before assuming the serial is unsupported.',
      'A model number alone, without a serial, cannot produce a manufacture date on this page &mdash; try the Goodman Model Number Lookup or Smart Lookup instead.'
    ],
    faqs: [
      ['How old is my Goodman unit?', 'Use the serial number from the rating plate. The supported Goodman path commonly reads the first two digits as year and the next two as month.'],
      ['Can the Goodman model number tell me the age?', 'Not as directly as the serial number. It is better for identifying the family and supporting replacement research.'],
      ['Why does my Goodman serial number not decode?', 'The label may be partial, damaged, or outside the supported Goodman path.'],
      ['Where is the Goodman serial number plate located?', 'Most Goodman equipment places it on the outdoor cabinet, furnace service area, or indoor access panel depending on product type.'],
      ['Can this support claim documentation?', 'Yes. The Goodman serial result is useful for HVAC claims, especially when the rating-plate photo is kept with the file.'],
      ['How old is a Goodman unit by serial number?', 'Enter the full rating-plate serial into the decoder above with Goodman selected. Digits 1-2 give the year and digits 3-4 give the month on the supported Goodman pattern.'],
      ['Is the Goodman model number the same as the serial number?', 'No. The model number identifies the equipment family (and, in some cases, includes a capacity code in the manufacturer\'s own naming convention). The serial number is the field this decoder reads for manufacture date.'],
      ['Does the model number tell me the tonnage of my Goodman unit?', 'This site does not decode tonnage or BTU capacity from the model number. Check the equipment nameplate directly, or use the Goodman Model Number Lookup page for model-focused research.'],
      ['What if my Goodman serial format is not supported?', 'Confirm the serial was copied exactly from the rating plate, watch for commonly misread characters, and try Smart Lookup with the model number if the standard decoder cannot resolve the format.']
    ],
    relatedLinks: [
      ['how-old-is-my-hvac', 'How Old Is My HVAC?'],
      ['carrier-serial-number-lookup', 'Carrier'],
      ['smart-lookup', 'Smart Lookup'],
      ['serial-number-location-guide', 'Serial Number Location Guide'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'asus-serial-number-decoder',
    title: 'ASUS Serial Number Manufacture Date Decoder',
    description: 'Decode supported ASUS serials whose first two characters match the documented 2010-2025 year/month table, with device-specific label and BIOS recovery.',
    socialTitleOverride: 'ASUS Serial Number Lookup & Model Number Help',
    socialDescriptionOverride: 'Use ASUS serial number lookup, ASUS model number lookup, and ASUS laptop serial number guidance to estimate manufacture date and identify supported ASUS device families.',
    h1: 'ASUS Serial Number Lookup & Model Number Help',
    badge: 'Electronics brand decoder',
    category: 'electronics',
    brandValue: 'asus',
    intro: 'Use this ASUS serial number lookup page when you need to find the label, estimate manufacture date, or move from an ASUS model number into the supported electronics decoder path.',
    supportingIntro: 'This page targets ASUS electronics, not appliances. The supported table currently covers year codes A through S for 2010-2025, skipping I, O, and Q, and accepts month codes 1-9 plus A-C.',
    decoderIntro: 'ASUS is preselected. Enter the full ASUS serial number exactly as shown on the device label.',
    decoderPlaceholder: 'Enter ASUS serial number',
    howToSteps: [
      'Use the electronics tab with ASUS selected.',
      'Enter the full serial number from the laptop, motherboard, desktop, or monitor label.',
      'Use the model number when you need device-family or warranty-style identification context.'
    ],
    decodeSectionTitle: 'How to decode an ASUS serial number',
    decodeSectionBody: 'The supported ASUS serial path uses character 1 for the year code and character 2 for the month code. Month values usually run 1-9 for January through September, then A, B, and C for October through December.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The ASUS model number is useful for product-family identification, laptop series lookup, motherboard platform research, and warranty/support-style device matching when the serial result alone is not enough for a final conclusion.',
    preGridSections: [
      {
        type: 'table',
        id: 'asus-worked-example',
        title: 'Verified ASUS serial example',
        intro: 'This fixture exercises the exact validation and character positions used by the current electronics decoder.',
        rows: [
          { field: 'Serial E5N0CV123456', meaning: 'Character 1 E; character 2 5', why: 'The supported table maps E to 2014 and 5 to May.' },
          { field: 'Remaining characters', meaning: 'Not used for the date result', why: 'They still remain part of the complete identifier and should be preserved for support or warranty lookup.' },
          { field: 'Short AB1234567', meaning: 'Below supported length', why: 'The decoder rejects it instead of returning a date from the first two characters alone.' }
        ]
      },
      {
        type: 'copy-block',
        id: 'asus-identifier-recovery',
        title: 'Recovering an ASUS serial without guessing',
        body: [
          'ASUS documents several recovery paths: the product label, packaging box, warranty card, BIOS or system information, and MyASUS on supported devices. Motherboards, graphics cards, notebooks, desktops, monitors, and phones do not all expose the identifier in the same place.',
          'If the first year code is outside the current 2010-2025 table, this tool returns unsupported. Use the complete model and official ASUS records rather than extending the letter sequence by assumption.'
        ]
      }
    ],
    formatSectionTitle: 'Common ASUS serial number formats',
    formats: [
      { label: 'ASUS laptop serials', pattern: 'Year code in character 1; month code in character 2', meaning: 'The supported path reads the opening year and month code directly from the serial.', confidence: 'Moderate confidence. Use model family to confirm full year.' },
      { label: 'ASUS motherboard serials', pattern: 'Same opening year/month code logic', meaning: 'Motherboards often rely on the same supported ASUS opening-code structure.', confidence: 'Moderate confidence.' },
      { label: 'ASUS desktops and displays', pattern: 'Same opening year/month code logic', meaning: 'The model number is still useful for product-family identification and warranty-style lookup after the serial age estimate.', confidence: 'Moderate confidence.' }
    ],
    exampleSectionTitle: 'ASUS serial number examples',
    examples: [
      { label: 'Verified supported fixture', serial: 'E5N0CV123456', note: 'Character 1 E resolves to 2014 and character 2 5 resolves to May.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'ASUS laptops', items: ['Bottom case label on most notebooks', 'System information, BIOS, or the original box when the underside label is worn'] },
      { title: 'ASUS motherboards', items: ['Board sticker near the edge or slots', 'Retail box barcode label if the board is already installed'] },
      { title: 'ASUS desktops and displays', items: ['Rear or side chassis label', 'Underside or stand-mount label on some monitors and all-in-ones'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Use the ASUS model number alongside the serial when the full year still needs product-era context.',
      'Do not route ASUS hardware through appliance pages or appliance serial logic.',
      'Try Smart Lookup if the serial label is worn, missing, or blocked by a mounted display or installed motherboard.',
      'Capture the full serial because the opening year and month codes depend on the first two characters.',
      'Keep warranty/support-style lookup separate from manufacture-date estimation when documentation requires both.'
    ],
    faqs: [
      ['Which ASUS year codes are supported?', 'The current table covers A through S for 2010-2025 while skipping I, O, and Q. Codes beyond that table are not extrapolated.'],
      ['How are October, November, and December represented?', 'The supported second-character month table uses A for October, B for November, and C for December after numeric months 1-9.'],
      ['Why is a nine-character ASUS string rejected?', 'The current decoder requires at least ten alphanumeric characters before it reads the opening year and month codes.'],
      ['Where can a notebook serial be recovered?', 'ASUS identifies the product label, packaging, warranty card, BIOS or system information, and MyASUS as supported recovery locations.'],
      ['Does the model number provide the manufacture date?', 'No. It identifies the device family and supports research, but the date result on this page comes from a supported serial format.'],
      ['Does this page cover ASUS appliances?', 'No. It is limited to supported ASUS electronics such as notebooks, desktops, motherboards, and monitors.']
    ],
    relatedLinks: [
      ['find-model-serial-number', 'Find Model & Serial Labels'],
      ['samsung-tv-serial-number-decoder', 'Samsung TV Serial Number Decoder'],
      ['hp', 'HP'],
      ['apple', 'Apple'],
      ['how-old-is-my-electronics', 'Electronics Identifier Guide'],
      ['smart-lookup', 'Smart Lookup'],
      ['methodology', 'Methodology']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'apple',
    title: 'Apple Serial Number and Model Identification Guide',
    description: 'Identify Apple model and serial numbers, understand the limits of modern randomized serials, and use supported legacy formats or Smart Lookup without assuming an exact manufacture date.',
    h1: 'Apple Serial Number and Model Identification Guide',
    badge: 'Legacy serial and model guide',
    category: 'electronics',
    brandValue: 'apple',
    applicationName: 'Apple Identifier Research Tool',
    primaryCtaLabel: 'Check an Apple Identifier',
    inputLabel: 'Enter Apple Serial Number',
    actionLabel: 'Check Apple Identifier',
    intro: 'Apple identifiers need an era check before they need a decoder. Older serial formats may expose a coded production week, while newer randomized serials do not provide a dependable date pattern for this tool to read.',
    supportingIntro: 'Use the serial path only for a supported legacy format. For a modern iPhone, iPad, Mac, Watch, or accessory, the model number and Apple support records are the more honest route to product generation and service context.',
    decoderIntro: 'Apple is preselected. A 12-character legacy-format serial may return candidate years and a coded week. A 10-character randomized serial will not produce a manufacture date.',
    decoderPlaceholder: 'Enter Apple serial number',
    howToSteps: [
      'Find the serial and model identifier in Settings, About This Mac, on the device, or on the original packaging.',
      'Use the decoder only when the serial matches the supported legacy-length path.',
      'Use the model identifier or Smart Lookup when the serial is modern, randomized, or ambiguous.'
    ],
    decodeSectionTitle: 'Legacy serials versus randomized serials',
    decodeSectionBody: 'The current decoder has a limited legacy path for 12-character serials: character 4 is treated as a repeating year code and characters 5-6 as a production-week field. Ten-character serials are treated as randomized and do not return a decoded date. A legacy result is still a candidate range, not proof of one exact manufacturing year.',
    modelSectionTitle: 'Why the Apple model identifier matters',
    modelSectionBody: 'The model identifier is the stronger clue for device family and generation. Apple documents how to reveal the model number in Settings and how to find serials on the device, packaging, or account. Smart Lookup can use that model context without pretending a randomized serial carries a public date code.',
    formatSectionTitle: 'Apple identifier paths supported here',
    formats: [
      { label: 'Legacy 12-character serial', pattern: 'Character 4 year code; characters 5-6 week field', meaning: 'Returns candidate years because the year letters repeat. The device generation must resolve the cycle.', confidence: 'Estimated cycle; legacy formats only.' },
      { label: 'Modern 10-character serial', pattern: 'Randomized identifier', meaning: 'The decoder explicitly reports that no date can be derived and directs the user to model research.', confidence: 'No manufacture-date decode.' },
      { label: 'Model identifier', pattern: 'A-number or model number', meaning: 'Identifies the device family and supports generation research through Apple documentation or Smart Lookup.', confidence: 'Useful for identity, not unit manufacture date.' }
    ],
    exampleSectionTitle: 'Supported Apple identifier outcomes',
    examples: [
      { label: 'Legacy-format decoder regression', serial: 'C02X12ABCDEF', note: 'The current tested rule reads X as candidate years 2019 or 2029 and reads 12 as the week field. It cannot choose the correct cycle without model-era evidence.' },
      { label: 'Randomized-format outcome', serial: '10 characters', note: 'The supported behavior is to stop and explain that the modern identifier is randomized rather than manufacture-date encoded.' },
      { label: 'Model identification path', serial: 'Settings > General > About', note: 'Apple documents how to reveal the model number and serial in device settings; that is the preferred recovery route for current devices.' }
    ],
    locationSectionTitle: 'Where Apple exposes model and serial information',
    locations: [
      { title: 'iPhone and iPad', items: ['Open Settings, then General, then About', '<a href="https://support.apple.com/en-us/106343" rel="noopener">Apple explains how to reveal the model number from the displayed part number</a>'] },
      { title: 'Mac', items: ['Use About This Mac or System Information', 'The underside and original packaging may also show the serial'] },
      { title: 'If the device is unavailable', items: ['Check the original packaging, receipt, or Apple Account device list', '<a href="https://support.apple.com/en-us/102858" rel="noopener">Apple lists product-specific serial-number locations</a>'] }
    ],
    problemSectionTitle: 'When not to infer a manufacture date',
    problems: [
      'Do not decode a modern randomized serial as though it used the older year/week layout.',
      'Do not treat a model release year as the manufacture date of one physical device.',
      'Do not choose one decade from a repeating legacy code without model-era evidence.',
      'Remove a leading S copied from a package barcode because Apple says it is not part of the serial.',
      'Use Apple support records for warranty or service decisions that require authoritative confirmation.'
    ],
    faqs: [
      ['Can every Apple serial number reveal a manufacture date?', 'No. The current tool only has a limited legacy-format path. Modern randomized serials do not provide a dependable public date pattern here.'],
      ['What should I use for a modern Apple device?', 'Use the model identifier, device Settings, Apple Account records, or Smart Lookup for generation context.'],
      ['Is a model release year the same as manufacture date?', 'No. A model may remain in production after introduction, so a release year identifies the family rather than the exact unit date.'],
      ['Where can I find the Apple model number?', 'On iPhone and iPad, open Settings, General, About, then tap the displayed part number to reveal the model number.'],
      ['Why can a legacy result show two years?', 'The supported legacy year letters repeat. Device generation or other documentation is needed to select the plausible cycle.']
    ],
    relatedSectionTitle: 'Apple and Electronics Research',
    relatedLinks: [['smart-lookup', 'Smart Lookup'], ['how-old-is-my-electronics', 'Electronics Age Guide'], ['find-model-serial-number', 'Find Model & Serial Labels'], ['computer-history', 'Computer History'], ['methodology', 'Methodology']],
    bottomCtaTitle: 'Have a modern Apple identifier?',
    bottomCtaBody: 'Use the model number and device description in Smart Lookup rather than forcing a date from a randomized serial.',
    bottomPrimaryLabel: 'Check a Legacy Serial',
    linkGroups: electronicsLinkGroups()
  },
  {
    slug: 'hp',
    title: 'HP Serial Number Date Code and Product ID Guide',
    description: 'Read the supported HP year-digit and production-week fields, distinguish product numbers from serial numbers, and verify ambiguous decade results with model context.',
    h1: 'HP Serial Number Date Code and Product ID Guide',
    badge: 'Computer and printer identifier guide',
    category: 'electronics',
    brandValue: 'hp',
    intro: 'HP labels carry several identifiers with different jobs. The serial identifies one device, the product number identifies its configuration, and the supported date-code path can return a year cycle and production week without proving one exact decade.',
    supportingIntro: 'This page covers HP notebooks, desktops, all-in-ones, monitors, and printers only where the serial matches the current tested rule. Keep the product number beside the serial because it is usually the better route to exact drivers, documentation, and model-family context.',
    decoderIntro: 'HP is preselected. Enter the full serial; the supported path reads character 4 as a repeating year digit and characters 5-6 as a week number.',
    decoderPlaceholder: 'Enter HP serial number',
    howToSteps: ['Find the label or open HP System Information or HP Support Assistant.', 'Enter the serial exactly as printed and review the candidate year cycle and week.', 'Use the product number and model family to resolve the decade before relying on the estimate.'],
    decodeSectionTitle: 'What the supported HP rule reads',
    decodeSectionBody: 'For a serial with at least six characters, the current rule reads character 4 as the last digit of a candidate year and characters 5-6 as the production week. Because a single digit repeats every decade, the output can remain ambiguous. An invalid week does not become a made-up month.',
    modelSectionTitle: 'Serial number versus product number',
    modelSectionBody: 'HP states that the serial identifies the specific device, while the model or product number identifies the product configuration within a series. Use the product number to find the correct drivers and support documents; use the serial for device-specific service and warranty workflows.',
    formatSectionTitle: 'HP identifiers and their roles',
    formats: [
      { label: 'Supported HP serial date field', pattern: 'Character 4 + characters 5-6', meaning: 'Character 4 supplies a repeating year digit; characters 5-6 supply a production-week number when valid.', confidence: 'Estimated decade; tested rule.' },
      { label: 'Product number / P/N', pattern: 'Configuration-specific identifier', meaning: 'Separates variants within a model series and is the best key for drivers and documentation.', confidence: 'Identification only.' },
      { label: 'Model or product name', pattern: 'Family name shown in software or on label', meaning: 'Provides generation and category context but does not identify one physical unit.', confidence: 'Context, not manufacture date.' }
    ],
    exampleSectionTitle: 'HP date-code walkthrough',
    examples: [
      { label: 'Tested decoder example', serial: 'CNX7120BXX', note: 'The current regression reads 7 as candidate years 2007 or 2017 and 12 as production week 12. The model family must decide which decade is plausible.' },
      { label: 'Invalid week handling', serial: 'Week outside 01-53', note: 'The decoder preserves the year-cycle clue but labels the week field invalid instead of converting it to a false month.' },
      { label: 'Product support workflow', serial: 'Serial + product number', note: 'HP recommends keeping both identifiers: the serial is device-specific, while the product number selects the exact configuration and documentation.' }
    ],
    locationSectionTitle: 'Where HP exposes the identifiers',
    locations: [
      { title: 'HP notebooks', items: ['Bottom label, battery compartment, kickstand, or original box', 'HP System Information and HP Support Assistant can display the identifiers'] },
      { title: 'HP desktops and all-in-ones', items: ['Side, rear, top, bottom, or pull-out label depending on chassis', 'HP System Information can show the product name, product number, and serial'] },
      { title: 'HP printers', items: ['Printer label or HP app product-information panel', '<a href="https://support.hp.com/gb-en/document/ish_2039298-1862169-16" rel="noopener">HP provides category-specific label instructions</a>'] }
    ],
    problemSectionTitle: 'Common HP interpretation mistakes',
    problems: ['Using the product name from the front bezel as though it identifies the exact configuration.', 'Choosing a decade from the year digit without checking model generation.', 'Treating a week field as a calendar month.', 'Entering a product number in the serial field.', 'Assuming every HP product line and era follows the same date-code layout.'],
    faqs: [
      ['Can an HP serial number show an exact year?', 'The supported rule returns a repeating year digit, so model generation is needed when more than one decade is plausible.'],
      ['What is the difference between an HP serial and product number?', 'The serial identifies one device. The product number identifies a configuration within a product series.'],
      ['Does the supported HP result include a month?', 'No. It uses a production-week field, not a month field.'],
      ['Where can I find HP identifiers without reading the label?', 'HP System Information, HP Support Assistant, and the HP app can display identifiers for supported product types.'],
      ['What if the HP rule does not match?', 'Keep the result unresolved and use the product number or Smart Lookup; do not force another brand or product-line rule.']
    ],
    relatedSectionTitle: 'HP and Computer Research',
    relatedLinks: [['smart-lookup', 'Smart Lookup'], ['how-old-is-my-electronics', 'Electronics Age Guide'], ['computer-history', 'Computer History'], ['find-model-serial-number', 'Find Device Labels'], ['methodology', 'Methodology']],
    bottomCtaTitle: 'Need to resolve the HP decade?',
    bottomCtaBody: 'Add the product number and model family in Smart Lookup when the serial year digit maps to more than one decade.',
    linkGroups: electronicsLinkGroups()
  },
  {
    slug: 'sony',
    title: 'Sony TV Model Number Year Guide',
    description: 'Use supported Sony BRAVIA model suffixes for model-generation context, find the TV model and serial labels, and avoid treating a model year as an exact unit manufacture date.',
    h1: 'Sony TV Model Number Year Guide',
    badge: 'Model-based TV research',
    category: 'electronics',
    brandValue: 'sony',
    inputMode: 'model',
    applicationName: 'Sony TV Model Year Guide',
    primaryCtaLabel: 'Check a Sony TV Model',
    inputLabel: 'Enter Sony TV Model Number',
    actionLabel: 'Check Model Year',
    intro: 'This Sony path is model-based. It reads a supported ending letter on recent BRAVIA model numbers as model-generation context; it does not decode the television serial number into an exact manufacture date.',
    supportingIntro: 'Use a complete model such as XR65A90K. The suffix can identify a model-year family, while the separate serial remains the unit-specific identifier used for service and support.',
    decoderIntro: 'Sony is preselected. Enter the TV model number, not the serial number. Supported suffixes H, J, K, L, M, and N map to model years 2020 through 2025 in the current rule.',
    decoderPlaceholder: 'Enter Sony TV model, e.g. XR65A90K',
    howToSteps: ['Find the full model name on the rear label, packaging, or TV system information.', 'Enter the model number and review the supported suffix result.', 'Treat the result as model-generation context, not the manufacture date of the individual TV.'],
    decodeSectionTitle: 'What the Sony suffix can determine',
    decodeSectionBody: 'The current rule reads the final letter of supported recent Sony TV model numbers: H=2020, J=2021, K=2022, L=2023, M=2024, and N=2025. This is a model-year interpretation. The serial number itself is not decoded by this path.',
    modelSectionTitle: 'Model name and serial number are different',
    modelSectionBody: 'Sony documents both fields separately on the product label and in TV system information. The model name identifies the product family; the serial identifies the individual unit. A suffix result cannot prove when that individual unit left the factory.',
    formatSectionTitle: 'Supported Sony TV model clues',
    formats: [
      { label: 'Recent BRAVIA suffix', pattern: 'Model ends H / J / K / L / M / N', meaning: 'Returns model-year context from 2020 through 2025 using the current supported mapping.', confidence: 'Model year only.' },
      { label: 'Sony serial number', pattern: 'Separate unit-specific identifier', meaning: 'Used for support and service; this page does not claim it contains a public manufacture-date code.', confidence: 'No serial date decode.' },
      { label: 'Unsupported model suffix', pattern: 'Other endings or incomplete model', meaning: 'The tool asks for a supported full model instead of inventing a year.', confidence: 'Stops without a model year.' }
    ],
    exampleSectionTitle: 'Sony model-year example',
    examples: [
      { label: 'Tested BRAVIA model', serial: 'XR65A90K', note: 'The current regression maps final suffix K to the 2022 model-year family. It does not claim the physical TV was manufactured in 2022.' },
      { label: 'Unsupported suffix', serial: 'Incomplete or unrecognized model', note: 'The expected result is guidance to supply a complete supported model, not a guessed date.' },
      { label: 'Wall-mounted TV recovery', serial: 'Rear label or system information', note: 'Sony recommends using the TV menu, original packaging, receipt, or rear product sticker when the label is hard to reach.' }
    ],
    locationSectionTitle: 'Where to find Sony TV identifiers',
    locations: [
      { title: 'TV system information', items: ['Open the Help, Contact & Support, or Product Support area depending on model', 'System information can display both model name and serial number'] },
      { title: 'Rear product label', items: ['Look near the side terminals, lower-right area, or bottom-center area', 'Use a small mirror and phone camera if the TV is wall mounted'] },
      { title: 'Packaging and receipt', items: ['The original carton and manual may show the model', '<a href="https://www.sony.com/electronics/support/articles/00121074" rel="noopener">Sony documents the model and serial locations</a>'] }
    ],
    problemSectionTitle: 'What this page deliberately does not claim',
    problems: ['A model suffix is not the manufacture date of one unit.', 'The serial number is not interchangeable with the model name.', 'Older or different Sony product families may use other naming systems.', 'An unsupported final letter does not justify choosing the nearest model year.', 'Service or warranty decisions should use Sony records and the unit serial.'],
    faqs: [
      ['Does this page decode Sony serial numbers?', 'No. The supported path reads recent Sony TV model suffixes for model-year context.'],
      ['What does K mean in XR65A90K?', 'The current supported mapping treats final K as the 2022 model-year family.'],
      ['Is model year the same as manufacture date?', 'No. Individual units can be manufactured during a broader production window.'],
      ['Where is the model name on a wall-mounted Sony TV?', 'Check system information first, or use a small mirror and phone camera to read the rear label.'],
      ['What if my Sony model ends with another letter?', 'Use Sony support documents or Smart Lookup; this page does not extend the suffix mapping beyond supported evidence.']
    ],
    relatedSectionTitle: 'Sony TV Research',
    relatedLinks: [['smart-lookup', 'Smart Lookup'], ['tv-history', 'TV History'], ['find-model-serial-number', 'Find TV Labels'], ['methodology', 'Methodology']],
    bottomCtaTitle: 'Have a Sony serial but no model?',
    bottomCtaBody: 'Find the model name in TV system information or add the visible label details to Smart Lookup.',
    bottomPrimaryLabel: 'Check a Sony Model',
    linkGroups: electronicsLinkGroups()
  },
  {
    slug: 'bosch',
    title: 'Bosch Appliance FD Number and Serial Date Guide',
    description: 'Read supported Bosch appliance FD production numbers, distinguish E-Nr, FD, Z-Nr, and serial fields, and find the rating plate by appliance type.',
    h1: 'Bosch Appliance FD Number and Serial Date Guide',
    badge: 'Bosch appliance rating-plate guide',
    category: 'appliances',
    brandValue: 'bosch',
    intro: 'Bosch belongs on the appliance path, not in a generic electronics cluster. The useful date field is the appliance FD production number; the E-Nr identifies the model, and the rating plate may also include a Z-Nr and serial.',
    supportingIntro: 'This page is for Bosch dishwashers, refrigerators, ovens, ranges, cooktops, and related home appliances using the supported FD structure. It does not claim that Bosch consumer electronics use the same rule.',
    decoderIntro: 'Bosch is preselected under Appliances. Enter the complete FD production number or supported Bosch rating-plate serial exactly as shown.',
    decoderPlaceholder: 'Enter Bosch FD number, e.g. FD8605123456',
    howToSteps: ['Locate the appliance rating plate and distinguish E-Nr from FD and Z-Nr.', 'Enter the full FD production number in the Bosch appliance decoder.', 'Keep the E-Nr for manuals, parts, and model-specific verification.'],
    decodeSectionTitle: 'How the supported Bosch FD path works',
    decodeSectionBody: 'For supported FD numbers, digits 3-4 are converted to a year by adding 1920 and digits 5-6 are read as the month. The decoder rejects impossible months instead of producing a date. This applies to the supported Bosch appliance FD structure.',
    modelSectionTitle: 'E-Nr, FD, Z-Nr, and serial each have a job',
    modelSectionBody: 'Bosch calls the E-Nr the model number and the FD the production number. Bosch registration and support pages also request the Z-Nr or serial information. Use the E-Nr for manuals and product documentation; use the supported FD field for production-date decoding.',
    formatSectionTitle: 'Bosch appliance rating-plate fields',
    formats: [
      { label: 'FD production number', pattern: 'FD + year digits + month digits', meaning: 'The supported decoder derives a year and month from the FD positions after validating the month.', confidence: 'High for supported FD structure.' },
      { label: 'E-Nr model number', pattern: 'Product model identifier', meaning: 'Used by Bosch for manuals, parts, registration, and model-specific documentation.', confidence: 'Identification only.' },
      { label: 'Z-Nr / serial field', pattern: 'Additional unit identifier', meaning: 'Useful for service and registration but not interchangeable with the FD date field.', confidence: 'Unit identification.' }
    ],
    exampleSectionTitle: 'Bosch FD worked example',
    examples: [
      { label: 'Verified decoder regression', serial: 'FD8605123456', note: 'The tested Bosch appliance rule reads 86 + 1920 as 2006 and reads 05 as May.' },
      { label: 'Invalid month protection', serial: 'FD86 13 ...', note: 'Month 13 is rejected. The decoder does not convert an impossible FD month into a plausible-looking date.' },
      { label: 'Manual lookup path', serial: 'E-Nr', note: 'Use the E-Nr, including its suffix where shown, on Bosch support to retrieve the correct manual and specifications.' }
    ],
    locationSectionTitle: 'Where Bosch places the rating plate',
    locations: [
      { title: 'Bosch dishwashers', items: ['Check the inner door edge or frame after opening the door', 'Photograph the entire plate so E-Nr, FD, and serial fields stay together'] },
      { title: 'Bosch refrigeration and cooking', items: ['Use Bosch appliance-specific rating-plate guidance for refrigerators, ovens, ranges, and cooktops', '<a href="https://www.bosch-home.com/us/owner-support/how-to-find-your-model-number" rel="noopener">Bosch provides a category-by-category plate finder</a>'] },
      { title: 'Registration and manuals', items: ['Bosch registration requests E-Nr, FD, and Z-Nr from the rating label', '<a href="https://www.bosch-home.com/us/owner-support/owner-manuals/" rel="noopener">Bosch manuals are searched by E-Nr</a>'] }
    ],
    problemSectionTitle: 'Common Bosch field mistakes',
    problems: ['Entering the E-Nr in the FD decoder field.', 'Dropping the FD prefix or copying only part of the production number.', 'Applying the appliance FD rule to unrelated Bosch product categories.', 'Reading the Z-Nr as the production date field.', 'Using a decoded date without retaining a rating-plate photo for verification.'],
    faqs: [
      ['What is the Bosch FD number?', 'Bosch calls FD the production number. The supported appliance decoder uses its year and month positions.'],
      ['Is E-Nr the serial number?', 'No. Bosch uses E-Nr as the model number; the rating plate can separately show FD, Z-Nr, and serial information.'],
      ['What does FD8605 mean?', 'Under the tested rule, 86 maps to 2006 and 05 maps to May.'],
      ['Where is the Bosch dishwasher rating plate?', 'It is commonly on the inner door edge or frame; use Bosch category guidance for the exact product type.'],
      ['Does this cover Bosch electronics?', 'No. This page is intentionally limited to supported Bosch home-appliance FD numbers.']
    ],
    relatedSectionTitle: 'Bosch Appliance Research',
    relatedLinks: [['dishwasher-serial-number', 'Dishwasher Serial Numbers'], ['refrigerator-serial-number', 'Refrigerator Serial Numbers'], ['how-old-is-my-appliance', 'Appliance Age Guide'], ['find-model-serial-number', 'Find Rating Plates'], ['methodology', 'Methodology']],
    bottomCtaTitle: 'Have the E-Nr but not the FD?',
    bottomCtaBody: 'Use Bosch manual lookup or Smart Lookup for model-family research, then return to the appliance rating plate for the production number.',
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'vizio',
    title: 'Vizio TV Model Number Year Guide',
    description: 'Use supported Vizio TV model-year codes and verified model-era records, find model and serial labels, and avoid claiming that Vizio serial numbers reveal manufacture dates.',
    h1: 'Vizio TV Model Number Year Guide',
    badge: 'Model-based TV identification',
    category: 'electronics',
    brandValue: 'vizio',
    applicationName: 'Vizio TV Model Year Guide',
    primaryCtaLabel: 'Check a Vizio Model',
    inputLabel: 'Enter Vizio Model Number',
    actionLabel: 'Check Model Year',
    intro: 'Vizio serial numbers are not treated as a dependable public manufacture-date code here. The supported workflow uses the TV model number, including tested model-era records and year letters that appear after a hyphen on recognized model formats.',
    supportingIntro: 'A model-year result identifies the product generation, not the factory date of one physical television. Keep the unit serial for registration and support, but enter the model number in this tool.',
    decoderIntro: 'Vizio is preselected and the model field is required. Enter a complete model such as VW32L HDTV10A or V505-J09; unsupported models return no date rather than a serial-based guess.',
    decoderPlaceholder: 'Serial is optional for Vizio',
    howToSteps: ['Find the model number on the TV label or product records.', 'Enter the model in the Vizio model field shown by the decoder.', 'Treat the returned year as model-era context, not an exact unit manufacture date.'],
    decodeSectionTitle: 'Why Vizio uses a model path',
    decodeSectionBody: 'The current Vizio implementation explicitly requires a model number and does not decode arbitrary serials. It recognizes a verified legacy model-era record and supported post-hyphen year letters. An unrelated serial such as LSPATBH4026090 returns no result by itself.',
    modelSectionTitle: 'What a Vizio model can reveal',
    modelSectionBody: 'Recognized model numbers can identify series, screen-size family, variant, and model year. That is useful for replacement and compatibility research, but it is different from identifying the exact month or day a unit was built.',
    formatSectionTitle: 'Supported Vizio model evidence',
    formats: [
      { label: 'Verified legacy model record', pattern: 'VW32L HDTV10A', meaning: 'Matches the repository-backed model-era lookup for September 2007.', confidence: 'Verified local model record.' },
      { label: 'Post-hyphen year letter', pattern: '...-J## through ...-P##', meaning: 'Recognized letters map to model years 2021 through 2026 in the current rule.', confidence: 'Model year, not unit date.' },
      { label: 'Vizio serial number', pattern: 'Unit-specific identifier', meaning: 'Retained for registration and support; arbitrary serials are not decoded into dates.', confidence: 'No serial date decode.' }
    ],
    exampleSectionTitle: 'Vizio model-year examples',
    examples: [
      { label: 'Verified model-era fixture', serial: 'VW32L HDTV10A', note: 'The existing regression returns September 2007 from the stored Vizio model record while explicitly stating that the serial format was not decoded.' },
      { label: 'Supported year-letter example', serial: 'V505-J09', note: 'The current model rule reads J after the hyphen as model year 2021. The 09 portion is a variant, not a manufacture month.' },
      { label: 'Unsupported serial behavior', serial: 'LSPATBH4026090', note: 'This serial alone returns no date. The model number is required instead of guessing from an unsupported serial pattern.' }
    ],
    locationSectionTitle: 'Where to find Vizio identifiers',
    locations: [
      { title: 'Rear TV label', items: ['Look on the back of the television for model and serial fields', 'Photograph the full label before mounting or moving the TV'] },
      { title: 'Box and receipt', items: ['The serial may appear on the side of the original box or purchase receipt', '<a href="https://www.vizio.com/en/account/product-registration" rel="noopener">Vizio documents serial-number locations for registration</a>'] },
      { title: 'Model field for this tool', items: ['Enter the model number, not the serial, in the model field', 'Use Smart Lookup when the model format is not recognized'] }
    ],
    problemSectionTitle: 'Common Vizio mistakes',
    problems: ['Entering the unit serial where the model number is required.', 'Calling a model-year result an exact manufacture date.', 'Treating the digits after the year letter as a month.', 'Assuming every Vizio series uses the same model convention.', 'Forcing a result from an unsupported serial.'],
    faqs: [
      ['Can this page decode a Vizio serial number?', 'No. The supported workflow is model-based because Vizio serial formats are not treated as reliably date-decodable here.'],
      ['What does J mean in V505-J09?', 'The current supported model mapping treats J after the hyphen as model year 2021.'],
      ['Does model year equal manufacture date?', 'No. It identifies the product generation, not the production date of one unit.'],
      ['What if I only have the serial?', 'Use the rear label, box, receipt, or Vizio registration records to recover the model, then use Smart Lookup if needed.'],
      ['Why did an arbitrary serial return no result?', 'That is intentional. The decoder refuses to invent a date from an unsupported Vizio serial.']
    ],
    relatedSectionTitle: 'Vizio TV Research',
    relatedLinks: [['smart-lookup', 'Smart Lookup'], ['tv-history', 'TV History'], ['find-model-serial-number', 'Find TV Labels'], ['methodology', 'Methodology']],
    bottomCtaTitle: 'Only have a Vizio serial?',
    bottomCtaBody: 'Recover the model from the label, box, receipt, or registration records before attempting a model-year lookup.',
    bottomPrimaryLabel: 'Check a Vizio Model',
    linkGroups: electronicsLinkGroups()
  },
  {
    slug: 'samsung-tv-serial-number-decoder',
    title: 'Samsung TV Serial Number Decoder and Model Guide',
    description: 'Decode supported Samsung TV and monitor serial year/month positions, understand repeating year codes, find TV identifiers, and separate TV logic from Samsung appliance and phone formats.',
    h1: 'Samsung TV Serial Number Decoder and Model Guide',
    badge: 'TV and monitor serial decoder',
    category: 'electronics',
    brandValue: 'samsung_tv',
    intro: 'Samsung TVs and monitors have a distinct electronics path even when parts of the serial structure resemble Samsung appliances. This page covers the supported 15-character and shorter TV/monitor layouts, repeating year codes, and TV-specific label recovery.',
    supportingIntro: 'The serial can expose a supported month and one or more candidate years. The model code is still needed when a year letter repeats, and newer or different Samsung product families may require Smart Lookup rather than this decoder.',
    decoderIntro: 'Samsung TV is preselected. Enter the complete TV or monitor serial; 15-character formats use characters 8-9, while supported shorter formats use characters 4-5.',
    decoderPlaceholder: 'Enter Samsung TV serial number',
    howToSteps: ['Confirm the product is a TV, monitor, projector, or supported home-theater device.', 'Copy the complete serial from About This TV, the rear label, or original box.', 'Review the year/month code and use the model code to resolve any repeated-year cycle.'],
    decodeSectionTitle: 'Supported Samsung TV serial positions',
    decodeSectionBody: 'For a supported 15-character serial, character 8 is the year code and character 9 is the month code. Supported shorter serials use characters 4 and 5. Month codes 1-9 and A-C map January through December; several year letters repeat across a 20-year cycle.',
    modelSectionTitle: 'Why the Samsung model code still matters',
    modelSectionBody: 'Samsung states that the model code identifies the device type and includes product details such as screen size and region. On this site it is also the best clue for deciding which candidate year is plausible when a serial letter repeats.',
    formatSectionTitle: 'Samsung TV and monitor serial paths',
    formats: [
      { label: '15-character TV serial', pattern: 'Year at character 8; month at character 9', meaning: 'Returns a supported month and candidate year or years from the electronics map.', confidence: 'Supported; decade may repeat.' },
      { label: 'Shorter supported serial', pattern: 'Year at character 4; month at character 5', meaning: 'Uses the shorter Samsung electronics position rule when the serial is not 15 characters.', confidence: 'Supported format-dependent path.' },
      { label: 'Samsung model code', pattern: 'Separate product-family identifier', meaning: 'Helps distinguish TV generation and resolve repeated serial year codes.', confidence: 'Context, not unit manufacture date.' }
    ],
    exampleSectionTitle: 'Samsung TV serial worked example',
    examples: [
      { label: 'Verified TV/electronics example', serial: '07R5CAHJB001234', note: 'Character 8 is J, which maps to candidate years 2017 or 2037. Character 9 is B, which maps to November. The model generation must resolve the year cycle.' },
      { label: 'Repeated year warning', serial: 'R / T / W / X / Y / A', note: 'These supported Samsung TV year letters can represent more than one cycle; the decoder keeps the ambiguity visible.' },
      { label: 'Category separation', serial: 'TV model + TV serial', note: 'Use this electronics path for TVs and monitors. Use the strengthened Samsung appliance page for refrigerators, laundry, cooking, and dishwashing products.' }
    ],
    locationSectionTitle: 'Where to find Samsung TV identifiers',
    locations: [
      { title: 'About This TV', items: ['Open Settings, Support, then About This TV or Contact Samsung', 'The screen can show model code, serial number, and software version'] },
      { title: 'Rear product label', items: ['Look for a silver label on the back of the TV', 'Photograph it before wall mounting when possible'] },
      { title: 'Samsung support path', items: ['Use the complete model code for manuals and generation context', '<a href="https://www.samsung.com/us/support/answer/ANS10005222/" rel="noopener">Samsung documents the About This TV identifier screen</a>'] }
    ],
    problemSectionTitle: 'When the Samsung TV result stays ambiguous',
    problems: ['Use the model code to select the plausible cycle when a year letter repeats.', 'Do not use the Samsung appliance or phone decoder for a TV serial.', 'Confirm total serial length before reading character positions.', 'Do not call a model release year the manufacture date of the individual TV.', 'Use Smart Lookup when a newer or unsupported serial layout does not match.'],
    faqs: [
      ['Is this the same as the Samsung appliance decoder?', 'No. This page is for TVs, monitors, and supported electronics; the appliance page covers major appliances.'],
      ['Why does a Samsung TV serial show two years?', 'Some supported year letters repeat across a 20-year cycle, so the model generation is needed to select the plausible one.'],
      ['Where can I find the serial without removing a wall-mounted TV?', 'Open Settings, Support, About This TV or Contact Samsung on supported models.'],
      ['Can the model code provide the exact manufacture date?', 'No. It provides product-generation context and can help resolve a serial cycle, but it is not the unit production date.'],
      ['What if the serial length does not match?', 'Do not shift character positions manually. Confirm the full serial and use Smart Lookup if the format remains unsupported.']
    ],
    relatedSectionTitle: 'Samsung TV and Electronics Research',
    relatedLinks: [['samsung-serial-number-lookup', 'Samsung Appliance Decoder'], ['smart-lookup', 'Smart Lookup'], ['tv-history', 'TV History'], ['methodology', 'Methodology']],
    bottomCtaTitle: 'Need to resolve a repeated Samsung TV year?',
    bottomCtaBody: 'Add the complete model code in Smart Lookup and keep the decoder result as a candidate range until the generation is confirmed.',
    linkGroups: electronicsLinkGroups()
  },
  {
    slug: 'google-pixel',
    title: 'Google Pixel Identifier and Serial Number Guide',
    description: 'Find Google Pixel phone, tablet, watch, and dock identifiers and use model context without relying on an unverified manufacture-date serial rule.',
    h1: 'Google Pixel Identifier and Serial Number Guide',
    badge: 'Public noindex identifier guide',
    category: 'electronics',
    brandValue: 'google_pixel',
    indexable: false,
    applicationName: 'Google Pixel Identifier Guide',
    primaryCtaLabel: 'Check a Pixel Identifier',
    inputLabel: 'Enter Pixel Identifier',
    actionLabel: 'Check Identifier',
    intro: 'This page remains available for Pixel identifier help, but it is temporarily excluded from search indexing. The repository contains a limited year/week serial rule that is not supported by enough manufacturer documentation or regression evidence to present as an approval-facing manufacture-date decoder.',
    supportingIntro: 'Use Google device settings, the Google Store device page, the physical product, or original packaging to recover the correct serial, IMEI, or model. Use Smart Lookup for product-family context rather than treating an unverified code as a unit date.',
    decoderIntro: 'The current Pixel rule is under evidence review. Any output is provisional and should not be used as proof of manufacture date.',
    decoderPlaceholder: 'Enter Pixel identifier for provisional check',
    howToSteps: ['Identify whether you have a phone IMEI, tablet serial, watch identifier, or dock serial.', 'Confirm the identifier in Google device settings or account records.', 'Use the model and product family in Smart Lookup; do not rely on a provisional date code for high-stakes use.'],
    decodeSectionTitle: 'Why this page is temporarily noindex',
    decodeSectionBody: 'The current code reads an opening year digit and two-digit week, but repository evidence does not yet establish which Pixel families and eras reliably use that structure. The page therefore does not make an approval-facing manufacture-date promise.',
    modelSectionTitle: 'Use the right Pixel identifier',
    modelSectionBody: 'Pixel phones and watches may expose IMEI information, while Pixel Tablet and dock products expose product-specific serials. The model or product family is the safer starting point for generation research.',
    formatSectionTitle: 'Pixel identifier recovery paths',
    formats: [
      { label: 'Pixel phone', pattern: 'IMEI and device information', meaning: 'Use About phone, Find My Device, or the original box to recover the official identifier.', confidence: 'Identification only.' },
      { label: 'Pixel Tablet', pattern: 'Serial in Settings or engraved on device', meaning: 'Google documents separate tablet, dock, and bundle serial locations.', confidence: 'Identification only.' },
      { label: 'Provisional date rule', pattern: 'Opening digit + week', meaning: 'Present in code but not strong enough for indexable manufacture-date claims.', confidence: 'Under evidence review.' }
    ],
    exampleSectionTitle: 'Honest Pixel outcomes',
    examples: [
      { label: 'Phone identifier path', serial: 'Settings > About phone > IMEI', note: 'Google documents this as a device identifier path, not as a manufacture-date decoder.' },
      { label: 'Tablet serial path', serial: 'Settings > About Tablet > Model', note: 'The serial appears under model information and can also be engraved on the tablet.' },
      { label: 'Date claim withheld', serial: 'Provisional year/week code', note: 'This page does not promote the internal rule as verified manufacture-date evidence until stronger documentation and tests exist.' }
    ],
    locationSectionTitle: 'Official Google identifier locations',
    locations: [
      { title: 'Pixel phones', items: ['Open Settings, About phone, then locate IMEI', 'Find My Device and the original box can also show the IMEI'] },
      { title: 'Pixel Tablet and dock', items: ['Tablet serial appears in Settings and is engraved on the back', 'Dock serial appears in dock settings and on the bottom'] },
      { title: 'Google Store help', items: ['Bundle products can have a bundle-specific serial', '<a href="https://support.google.com/store/answer/3333000?hl=en" rel="noopener">Google documents device-specific serial and IMEI locations</a>'] }
    ],
    problemSectionTitle: 'Do not overread Pixel identifiers',
    problems: ['IMEI, model, and serial are different identifiers.', 'A device generation is not an exact manufacture date.', 'A rule that works on one Pixel family may not apply to another.', 'Do not use provisional output for warranty, resale, or claim documentation.', 'Use Google support records when authoritative confirmation is needed.'],
    faqs: [
      ['Why is this page noindex?', 'Its identifier guidance is useful, but the current date-code rule lacks enough verified evidence for an independent approval-facing search page.'],
      ['Can a Pixel IMEI reveal manufacture date here?', 'No. This page treats IMEI as a device identifier, not a public manufacture-date code.'],
      ['Where is a Pixel Tablet serial?', 'Google documents it in Settings under About Tablet and engraved on the back of the tablet.'],
      ['What should I enter in Smart Lookup?', 'Use the Pixel model or generation plus any visible product description; avoid submitting account or personal data.'],
      ['Will this page become indexable later?', 'Only after the supported product families and date behavior have stronger documentation and regression coverage.']
    ],
    relatedSectionTitle: 'Verified Electronics Research Paths',
    relatedLinks: [['smart-lookup', 'Smart Lookup'], ['how-old-is-my-electronics', 'Electronics Age Guide'], ['find-model-serial-number', 'Find Device Labels'], ['methodology', 'Methodology']],
    bottomCtaTitle: 'Need Pixel generation context?',
    bottomCtaBody: 'Use the model and product family in Smart Lookup instead of treating an IMEI or provisional serial code as a manufacture date.',
    bottomPrimaryLabel: 'Run a Provisional Check',
    linkGroups: electronicsLinkGroups()
  },
  {
    slug: 'panasonic',
    title: 'Panasonic Model and Serial Number Location Guide',
    description: 'Find Panasonic TV and electronics model and serial labels by product family without relying on an unverified universal manufacture-date serial rule.',
    h1: 'Panasonic Model and Serial Number Location Guide',
    badge: 'Public noindex location guide',
    category: 'electronics',
    brandValue: 'panasonic',
    indexable: false,
    applicationName: 'Panasonic Identifier Guide',
    primaryCtaLabel: 'Check a Panasonic Identifier',
    inputLabel: 'Enter Panasonic Identifier',
    actionLabel: 'Check Identifier',
    intro: 'Panasonic uses many product families, and the current repository has one broad opening-character rule that is not documented strongly enough to present as a universal manufacture-date decoder. This page remains public for label-location help but is temporarily excluded from search indexing.',
    supportingIntro: 'Start with the product category and model prefix. Panasonic documents different label locations for TVs, audio products, cameras, projectors, and other equipment; those identifiers support manuals and service research even when no defensible date decode is available.',
    decoderIntro: 'The current Panasonic date rule is provisional. Do not treat its output as proof of manufacture date.',
    decoderPlaceholder: 'Enter Panasonic identifier for provisional check',
    howToSteps: ['Identify the product family from its model prefix.', 'Find the model and serial label using Panasonic category guidance.', 'Use the model in manuals or Smart Lookup; keep any provisional serial result clearly unverified.'],
    decodeSectionTitle: 'Why one universal Panasonic rule is not enough',
    decodeSectionBody: 'The existing code interprets the first character as a repeating year digit and the second as a factory-or-month code. Because the second-character meaning varies by product line and the repository lacks product-family regression fixtures, that rule is not strong enough for an indexable manufacture-date claim.',
    modelSectionTitle: 'Product family controls the research path',
    modelSectionBody: 'Panasonic documents different model prefixes and label locations across televisions, audio products, Blu-ray players, cameras, projectors, and other devices. The model number is the safest key for manuals, specifications, and product-generation context.',
    formatSectionTitle: 'Panasonic identification paths',
    formats: [
      { label: 'Televisions', pattern: 'TC- / TH- / TV- model prefixes', meaning: 'Model and serial may be on carton, side label, rear label, or underside of the frame.', confidence: 'Official location guidance.' },
      { label: 'Audio and video products', pattern: 'Product-specific prefixes', meaning: 'Back, bottom, or side label varies by category; use Panasonic support guidance.', confidence: 'Official location guidance.' },
      { label: 'Provisional opening-code rule', pattern: 'Year digit + factory/month code', meaning: 'Too broad and product-line dependent for approval-facing manufacture-date claims.', confidence: 'Under evidence review.' }
    ],
    exampleSectionTitle: 'What this page can verify today',
    examples: [
      { label: 'TV label recovery', serial: 'TC- / TH- / TV-', note: 'Panasonic documents TV model and serial information on the carton, side, rear, or underside label depending on model.' },
      { label: 'Camera label recovery', serial: 'DMC- / DC-', note: 'Panasonic documents LUMIX model and serial information on the bottom of the camera body.' },
      { label: 'Date claim withheld', serial: '4B123456', note: 'The current code can produce candidate years from this pattern, but the factory/month meaning is product-line dependent and is not promoted as verified.' }
    ],
    locationSectionTitle: 'Panasonic label locations vary by family',
    locations: [
      { title: 'Panasonic televisions', items: ['Check the carton, side label, rear label, or underside of the frame', 'Keep the model prefix because it identifies the TV family'] },
      { title: 'Audio, video, and projectors', items: ['Labels are commonly on the back, bottom, or side depending on product', 'Use the complete model in Panasonic manuals'] },
      { title: 'Panasonic support guidance', items: ['Select the exact category before relying on a label location', '<a href="https://help.na.panasonic.com/answers/how-to-find-the-model-number-or-serial-number-of-a-panasonic-product/" rel="noopener">Panasonic lists product-family-specific locations</a>'] }
    ],
    problemSectionTitle: 'Avoid cross-family assumptions',
    problems: ['Do not apply a TV identifier pattern to a camera, audio product, or appliance.', 'Do not describe a factory code as a month without product-line evidence.', 'Do not choose a decade from one leading digit without model-era context.', 'Use manuals and support records for authoritative product identification.', 'Keep provisional decoder output out of high-stakes documentation.'],
    faqs: [
      ['Why is this Panasonic page noindex?', 'The location guidance is useful, but the current universal date rule is not sufficiently verified across Panasonic product families.'],
      ['Where is a Panasonic TV serial?', 'Panasonic lists the carton, side label, rear label, and underside of the frame as possible locations.'],
      ['Can the first serial character prove the manufacture year?', 'Not here. The current rule is decade-ambiguous and lacks enough product-family evidence.'],
      ['What is the best Panasonic lookup key?', 'Use the complete model number for manuals and product-family research, with the serial retained for service identification.'],
      ['Can Smart Lookup provide an exact unit date?', 'It may provide model-era context, but it should not convert a release year into an exact unit manufacture date.']
    ],
    relatedSectionTitle: 'Verified Electronics Research Paths',
    relatedLinks: [['smart-lookup', 'Smart Lookup'], ['how-old-is-my-electronics', 'Electronics Age Guide'], ['find-model-serial-number', 'Find Device Labels'], ['tv-history', 'TV History'], ['methodology', 'Methodology']],
    bottomCtaTitle: 'Need Panasonic product-family context?',
    bottomCtaBody: 'Use the complete model prefix and category in Smart Lookup or Panasonic manuals; do not force one serial rule across unrelated product lines.',
    bottomPrimaryLabel: 'Run a Provisional Check',
    linkGroups: electronicsLinkGroups()
  }
];

const sitemapEntries = [
  ['/', 'weekly', '1.0'],
  ['/about', 'monthly', '0.6'],
  ['/assistant', 'weekly', '0.7'],
  ['/brands', 'monthly', '0.6'],
  ['/contact', 'yearly', '0.4'],
  ['/decoder-tool', 'weekly', '0.9'],
  ['/feedback', 'monthly', '0.4'],
  ['/find-model-serial-number', 'monthly', '0.8'],
  ['/how-old-is-my-appliance', 'monthly', '0.9'],
  ['/how-old-is-my-hvac', 'monthly', '0.9'],
  ['/how-old-is-my-plumbing', 'monthly', '0.9'],
  ['/how-old-is-my-electronics', 'monthly', '0.9'],
  ['/serial-number-location-guide', 'monthly', '0.9'],
  ['/appliance-age-for-insurance-and-replacement', 'monthly', '0.8'],
  ['/rcv-acv-calculator', 'monthly', '0.8'],
  ['/sales-tax-decalculator', 'monthly', '0.8'],
  ['/how-to-find-hvac-age', 'monthly', '0.8'],
  ['/how-to-read-serial-number', 'monthly', '0.8'],
  ['/hvac-age-by-serial-number', 'monthly', '0.8'],
  ['/methodology', 'monthly', '0.5'],
  ['/privacy-policy', 'yearly', '0.3'],
  ['/security', 'yearly', '0.3'],
  ['/smart-lookup', 'weekly', '0.9'],
  ['/refrigerator-serial-number', 'monthly', '0.8'],
  ['/washer-serial-number', 'monthly', '0.8'],
  ['/dryer-serial-number', 'monthly', '0.8'],
  ['/dishwasher-serial-number', 'monthly', '0.8'],
  ['/range-oven-serial-number', 'monthly', '0.8'],
  ['/whirlpool-serial-number-lookup', 'monthly', '0.8'],
  ['/ge-serial-number-lookup', 'monthly', '0.8'],
  ['/samsung-serial-number-lookup', 'monthly', '0.8'],
  ['/lg-serial-number-lookup', 'monthly', '0.8'],
  ['/frigidaire-serial-number-lookup', 'monthly', '0.8'],
  ['/maytag-serial-number-lookup', 'monthly', '0.8'],
  ['/kenmore-serial-number-lookup', 'monthly', '0.8'],
  ['/goodman-serial-number-lookup', 'monthly', '0.8'],
  ['/carrier-serial-number-lookup', 'monthly', '0.8'],
  ['/trane-serial-number-lookup', 'monthly', '0.8'],
  ['/rheem-serial-number-lookup', 'monthly', '0.8'],
  ['/asus-serial-number-decoder', 'monthly', '0.8'],
  ['/samsung-tv-serial-number-decoder', 'monthly', '0.7'],
  ['/apple', 'monthly', '0.7'],
  ['/hp', 'monthly', '0.7'],
  ['/sony', 'monthly', '0.7'],
  ['/bosch', 'monthly', '0.7'],
  ['/item-history-guides', 'monthly', '0.8'],
  ['/electrical-service-panel-history', 'monthly', '0.7'],
  ['/electrical-wiring-history', 'monthly', '0.7'],
  ['/hvac-system-history', 'monthly', '0.7'],
  ['/water-heater-history', 'monthly', '0.7'],
  ['/major-appliances-history', 'monthly', '0.7'],
  ['/tv-history', 'monthly', '0.7'],
  ['/computer-history', 'monthly', '0.7'],
  ['/large-loss-decoder', 'weekly', '0.9'],
  ['/vizio', 'monthly', '0.6'],
  ['/disclaimer', 'yearly', '0.3']
];

// Only publish lastmod when a route has an explicitly maintained, material
// content-review date. Shared navigation, formatting, generated output, and
// unrelated commits do not qualify, so unreviewed routes intentionally omit it.
function renderSitemap(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(([route, changefreq, priority]) => `  <url>
    <loc>${siteUrl}${route}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

pages.forEach((page) => {
  fs.writeFileSync(path.join(root, `${page.slug}.html`), normalizeGeneratedHtml(renderPage(page)));
});

fs.writeFileSync(path.join(root, 'sitemap.xml'), renderSitemap(sitemapEntries));

console.log(`Generated ${pages.length} SEO pages and refreshed sitemap.xml.`);
