import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const siteUrl = 'https://www.decodemyitem.com';

const navLinks = `
  <li><a href="/">Home</a></li>
  <li><a href="/decoder-tool">Serial Number Decoder</a></li>
  <li><a href="/smart-lookup">Smart Lookup</a></li>
  <li><a href="/assistant">AI Assistant</a></li>
  <li><a href="/methodology">Methodology</a></li>
  <li><a href="/contact">Contact</a></li>
  <li><a href="/feedback">Feedback &amp; Bugs</a></li>
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
  ['apple', 'Apple'],
  ['hp', 'HP'],
  ['sony', 'Sony'],
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

function scriptJson(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function isBrandSerialLookupPage(page) {
  return /-serial-number-lookup$/.test(page.slug);
}

function pageSiteLabel(page) {
  return isBrandSerialLookupPage(page) ? 'Decode My Item' : 'Item Assist';
}

function pageHtmlTitle(page) {
  const siteLabel = pageSiteLabel(page);
  return page.title.includes('Item Assist') ? page.title.replace('Item Assist', siteLabel) : `${page.title} | ${siteLabel}`;
}

function pageSocialTitle(page) {
  return page.title.includes('Item Assist') ? page.title : `${page.title} | Item Assist`;
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
    name: page.title,
    description: page.description,
    url,
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      name: 'Item Assist',
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
    name: 'Item Assist Serial Number Decoder',
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
                    <button class="search-tab cat-tab${page.category === 'appliances' ? ' active' : ''}" data-cat="appliances" onclick="selectCatAndShowDecoder('appliances', this)">Appliances</button>
                    <button class="search-tab cat-tab${page.category === 'waterHeaters' ? ' active' : ''}" data-cat="waterHeaters" onclick="selectCatAndShowDecoder('waterHeaters', this)">Water Heaters</button>
                    <button class="search-tab cat-tab${page.category === 'hvac' ? ' active' : ''}" data-cat="hvac" onclick="selectCatAndShowDecoder('hvac', this)">HVAC</button>
                    <button class="search-tab cat-tab${page.category === 'electronics' ? ' active' : ''}" data-cat="electronics" onclick="selectCatAndShowDecoder('electronics', this)">Electronics</button>
                  </div>

                  <div class="search-panel" id="panel-decoder">
                    <div class="home-tool-row">
                      <label class="sr-only" for="brand">Select Brand</label>
                      <select id="brand" class="search-select">
                        <option value="">-- Select Brand --</option>
                      </select>

                      <label class="sr-only serial-label" for="serial">Enter Serial Number</label>
                      <input type="text" id="serial" class="search-input" placeholder="${page.decoderPlaceholder || 'Enter serial number exactly as shown'}">
                    </div>

                    <div class="era-group hidden" id="eraGroup">
                      <label class="sr-only" for="eraSelect">Manufacture Era</label>
                      <select id="eraSelect" class="search-select" style="margin-top:8px;">
                        <option value="">-- Select Era --</option>
                        <option value="post">Post-2006</option>
                        <option value="pre">Pre-2006</option>
                      </select>
                      <p class="era-note">Some brands reuse serial layouts across decades. Select the era when prompted to improve accuracy.</p>
                    </div>

                    <p class="search-hint serial-helper-text">${page.decoderIntro}</p>
                    <div class="tool-panel-action">
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
                We use the brand-specific serial rules already supported in Item Assist. When a brand repeats codes across decades, the result stays estimated until model era or installation context confirms the right cycle.
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
  <title>${pageHtmlTitle(page)}</title>
  <meta name="description" content="${page.description}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:locale" content="en_US">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${pageSiteLabel(page)}">
  <meta property="og:title" content="${pageSocialTitle(page)}">
  <meta property="og:description" content="${page.description}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${siteUrl}/assets/item-assist-banner.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageSocialTitle(page)}">
  <meta name="twitter:description" content="${page.description}">
  <meta name="twitter:image" content="${siteUrl}/assets/item-assist-banner.png">
  <link rel="stylesheet" href="shared.css">
  <link rel="stylesheet" href="seo-landing.css">
  <link rel="icon" type="image/png" href="favicon.png">
</head>
<body class="serial-location-page" data-page-kind="brand-page">
  <nav>
    <a href="/" class="logo" aria-label="Item Assist home">
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
        <li><a href="/rheem-serial-number-lookup">Rheem</a></li>
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
        <li><a href="/where-is-my-serial-number">Where Is My Serial Number?</a></li>
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
  <script defer src="decoder-data.js"></script>
  <script defer src="lkq-engine.js"></script>
  <script defer src="analytics.js"></script>
  <script defer src="smart-lookup-bundle.js"></script>
  <script defer src="script.js"></script>
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
  const schema = [
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
      brandSelect.dispatchEvent(new Event('change'));`
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
  <title>${pageHtmlTitle(page)}</title>
  <meta name="description" content="${page.description}">
  <link rel="canonical" href="${url}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:locale" content="en_US">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${pageSiteLabel(page)}">
  <meta property="og:title" content="${pageSocialTitle(page)}">
  <meta property="og:description" content="${page.description}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${siteUrl}/assets/item-assist-banner.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${pageSocialTitle(page)}">
  <meta name="twitter:description" content="${page.description}">
  <meta name="twitter:image" content="${siteUrl}/assets/item-assist-banner.png">
  <link rel="stylesheet" href="shared.css">
  <link rel="stylesheet" href="seo-landing.css">
  <link rel="icon" type="image/png" href="favicon.png">
</head>
<body data-page-kind="brand-page">

  <!-- ═══ NAV ═══ -->
  <nav>
    <a href="/" class="logo" aria-label="Decode My Item home">
      <span class="material-symbols-outlined logo-icon">qr_code_scanner</span>
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
          ${cat.label}
        </span>

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
          Decode Serial Number
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
                    <button class="search-tab cat-tab${page.category === 'appliances' ? ' active' : ''}" data-cat="appliances" onclick="selectCatAndShowDecoder('appliances', this)">Appliances</button>
                    <button class="search-tab cat-tab${page.category === 'waterHeaters' ? ' active' : ''}" data-cat="waterHeaters" onclick="selectCatAndShowDecoder('waterHeaters', this)">Water Heaters</button>
                    <button class="search-tab cat-tab${page.category === 'hvac' ? ' active' : ''}" data-cat="hvac" onclick="selectCatAndShowDecoder('hvac', this)">HVAC</button>
                    <button class="search-tab cat-tab${page.category === 'electronics' ? ' active' : ''}" data-cat="electronics" onclick="selectCatAndShowDecoder('electronics', this)">Electronics</button>
                  </div>
                  <div class="search-panel" id="panel-decoder">
                    <div class="home-tool-row">
                      <label class="sr-only" for="brand">Select Brand</label>
                      <select id="brand" class="search-select"><option value="">-- Select Brand --</option></select>
                      <label class="sr-only serial-label" for="serial">Enter Serial Number</label>
                      <input type="text" id="serial" class="search-input" placeholder="${page.decoderPlaceholder || 'Enter serial number exactly as shown'}">
                    </div>
                    <div class="era-group hidden" id="eraGroup">
                      <label class="sr-only" for="eraSelect">Manufacture Era</label>
                      <select id="eraSelect" class="search-select" style="margin-top:8px;">
                        <option value="">-- Select Era --</option>
                        <option value="post">Post-2006</option>
                        <option value="pre">Pre-2006</option>
                      </select>
                      <p class="era-note">Some brands reuse serial layouts across decades. Select the era when prompted to improve accuracy.</p>
                    </div>
                    <p class="search-hint serial-helper-text">${page.decoderIntro}</p>
                    <div class="tool-panel-action">
                      <button id="decodeBtn" class="btn-primary power-btn" type="button" disabled onclick="decodeSerial()">Decode Serial Number</button>
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
                We use the brand-specific serial rules already supported in Item Assist. When a brand repeats codes across decades, the result stays estimated until model era or installation context confirms the right cycle.
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

      <!-- Examples -->
      <div class="bp-section-card bp-full-width">
        <div class="bp-section-card-head">
          <span class="material-symbols-outlined bp-section-icon" style="color:${cat.color};">terminal</span>
          <h2>${page.exampleSectionTitle}</h2>
        </div>
        <div class="ex-terminals-grid">
          ${renderExampleTerminals(page.examples)}
        </div>
      </div>

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
          <h2>Related Decoder Pages</h2>
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
        <h2>Need a claim-ready replacement summary?</h2>
        <p>Use the decoder above to start, or try Smart Lookup if the serial label is worn or missing.</p>
        <div class="bp-cta-row">
          <a href="#decoder-tool" class="bp-cta-btn" style="background:${cat.color};color:#00382d;">
            <span class="material-symbols-outlined" style="font-size:16px;">bolt</span> Decode a Serial
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
        <p class="footer-col-heading">Resources</p>
        <ul>
          ${footerResources.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join('\n          ')}
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span class="footer-bottom-copy">&copy; 2026 Decode My Item &middot; Database verified February 2026</span>
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
  ${schema.map(scriptJson).join('\n  ')}
</body>
</html>
`;
}



function baseLinkGroups() {
  return [
    { title: 'Appliance Age Lookup', links: [['how-old-is-my-appliance', 'How Old Is My Appliance?'], ['where-is-my-serial-number', 'Where Is My Serial Number?'], ['appliance-age-for-insurance-and-replacement', 'Insurance, Repair & Replacement'], ['find-model-serial-number', 'Find Model & Serial Labels']] },
    { title: 'Popular Appliance Brands', links: applianceBrandLinks.slice(0, 8) },
    { title: 'Appliance Type Lookups', links: applianceTypeLinks.slice(1, 6) },
    { title: 'HVAC Age Lookup', links: hvacLinks },
    { title: 'Electronics Serial & Model Lookup', links: electronicsLinks }
  ];
}

const pages = [
  {
    slug: 'appliance-age-for-insurance-and-replacement',
    title: 'Why Appliance Age Matters for Insurance, Repair & Replacement',
    description: 'Learn why appliance age verification matters for insurance claims, repair decisions, replacement research, depreciation, and technician documentation.',
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
      { title: 'Support and replacement workflow', items: ['<a href="/how-old-is-my-appliance">How old is my appliance?</a>', '<a href="/where-is-my-serial-number">Where is my serial number?</a>', '<a href="/replacement-lookup">Replacement lookup</a>', 'Use Smart Lookup when the label is partial or missing'] }
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
    title: 'Refrigerator Serial Number Lookup | Find Age & Model Info',
    description: 'Find refrigerator serial number labels, decode supported brand formats, and estimate refrigerator age with brand shortcuts and model-number guidance.',
    h1: 'Refrigerator Serial Number Lookup',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Use this refrigerator serial number lookup page when you need to find the label, estimate age, or move from a model number into the fastest supported decode path.',
    supportingIntro: 'Refrigerator serial numbers are usually brand-specific. The best workflow is to locate the label, choose the correct brand in the decoder, and use the model number only as a support signal when the serial result stays estimated.',
    decoderIntro: 'Use the refrigerator brand and serial number exactly as shown on the label.',
    decoderPlaceholder: 'Enter refrigerator serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'On supported refrigerator brands, the serial number often reveals the manufacturing year, month, or production week. That makes it the best first step for age checks, warranty-era research, and replacement planning.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number usually identifies the product family, door style, and generation. It becomes especially useful when the serial year code repeats or when a private-label refrigerator needs an OEM match first.',
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
      { label: 'Supported Whirlpool example', serial: 'CB2501800', note: 'This is a supported Whirlpool-family example. The serial can resolve a production week, but the decade still needs appliance-era context.' },
      { label: 'Supported Bosch-style FD example', serial: 'FD911100449', note: 'This FD example is stronger for Bosch-family kitchen products than most refrigerator formats because the year and month are embedded more directly.' },
      { label: 'Illustrative LG pattern', serial: '810XXXXXXX', note: 'Illustrative LG refrigerator pattern. The current decoder treats the opening year digit and month digits as the main age signal, with decade resolved from product era.' }
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
      ['How do I find the age of my refrigerator?', 'Locate the product label inside the cabinet, choose the brand in the decoder, and enter the serial number exactly as shown.'],
      ['Can the model number tell me how old the refrigerator is?', 'Usually not by itself. The model number is better for identifying the product family, while the serial number usually carries the date logic.'],
      ['Why does my refrigerator serial number not decode?', 'A partial label, the wrong brand path, a private-label OEM, or a repeating year code are the most common reasons.'],
      ['Where is the refrigerator serial number label usually located?', 'Most refrigerators place it inside the fresh-food compartment on a side wall, behind a drawer, or on an interior trim area.'],
      ['Can I still use this for claim documentation?', 'Yes. Just note whether the result is supported directly by the serial format or still estimated because the code cycle repeats.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Refrigerator Age Path'],
      ['ge-serial-number-lookup', 'GE Refrigerator Age Path'],
      ['lg-serial-number-lookup', 'LG Refrigerator Age Path'],
      ['frigidaire-serial-number-lookup', 'Frigidaire Refrigerator Age Path'],
      ['find-model-serial-number', 'Find Model & Serial Labels']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'washer-serial-number',
    title: 'Washer Serial Number Lookup | Decode Brand, Age & Model Info',
    description: 'Find washer serial number labels, decode supported brand formats, and use model-number context to estimate washer age faster.',
    h1: 'Washer Serial Number Lookup',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Use this washer serial number lookup page when you need a fast age estimate, a label-location refresher, or a cleaner path from the model number into the supported brand decoder.',
    supportingIntro: 'Washer serial numbers usually carry the stronger age signal. The model number helps confirm the generation and OEM family when the serial result stays decade-ambiguous.',
    decoderIntro: 'Select the washer brand and enter the serial exactly as shown.',
    decoderPlaceholder: 'Enter washer serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'On supported brands, the washer serial number can point to a manufacturing year, production week, or month-year window. That is usually the fastest way to document appliance age when purchase history is missing.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The washer model number helps identify the family, platform, and OEM source. It is especially useful for Kenmore, Maytag-era overlap, and older products where the serial code alone is not enough to lock the decade.',
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
      { label: 'Supported Whirlpool example', serial: 'CB2501800', note: 'Supported Whirlpool-family example. The current decoder can use the year code and week digits after the correct brand path is selected.' },
      { label: 'Illustrative GE pattern', serial: 'AZ123456', note: 'Illustrative GE washer pattern. The opening letters typically carry the month and year meaning.' },
      { label: 'Illustrative Samsung pattern', serial: 'XXXABXXXXXX', note: 'Illustrative 11-character Samsung washer pattern. The supported decoder checks positions 4-5 for year and month on this serial family.' }
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
      ['How do I tell how old my washer is?', 'Find the serial label, choose the correct brand, and run the serial number through the decoder.'],
      ['What can the washer model number tell me?', 'It usually identifies the product family, the likely generation, and in some cases the OEM platform that built the washer.'],
      ['Why does the washer serial number not decode?', 'Common reasons are a hidden label, a partial serial, the wrong brand path, or a repeated year code that still needs model-era context.'],
      ['Where is the washer serial number label located?', 'Top-load models often place it under the lid, while front-load models usually place it around the door opening or on the rear panel.'],
      ['Can this help with claim documentation?', 'Yes. Serial results are useful for age support, but the file should note when a decade is still estimated.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Washer Path'],
      ['maytag-serial-number-lookup', 'Maytag Washer Path'],
      ['samsung-serial-number-lookup', 'Samsung Washer Path'],
      ['lg-serial-number-lookup', 'LG Washer Path'],
      ['kenmore-serial-number-lookup', 'Kenmore Washer Path']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'dryer-serial-number',
    title: 'Dryer Serial Number Lookup | Find Age by Serial Number',
    description: 'Find dryer serial number labels, decode supported brand patterns, and use model-number context when the dryer serial result stays estimated.',
    h1: 'Dryer Serial Number Lookup',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Use this dryer serial number lookup page to find the label, decode the strongest supported brand formats, and move faster when the year code needs model-era context.',
    supportingIntro: 'Dryer age checks are usually serial-driven. The model number is mainly used to verify the generation, confirm OEM family, or support a fallback when the label is worn.',
    decoderIntro: 'Select the dryer brand and enter the serial number exactly as shown.',
    decoderPlaceholder: 'Enter dryer serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'Supported dryer serial formats can point to the manufacturing year, production week, or month-year window. That is usually enough to narrow age for replacement planning and claim support.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The dryer model number helps sort family, fuel type, and OEM source. It is useful when serial year codes repeat or when a private-label product needs a manufacturer match first.',
    formatSectionTitle: 'Common dryer serial number formats',
    formats: [
      { label: 'Whirlpool-family dryers', pattern: '9 or 10 characters with year code + week', meaning: 'The year code usually sits in position 2 or 3 depending on total serial length.', confidence: 'Estimated decade. Whirlpool cycles repeat.' },
      { label: 'Maytag dryers', pattern: 'Legacy and Whirlpool-era paths', meaning: 'Older Maytag dryers use a different pattern than newer Whirlpool-era Maytag products.', confidence: 'Estimated until the era is confirmed.' },
      { label: 'GE dryers', pattern: 'Month letter + year letter opening', meaning: 'The first letters are usually the meaningful timing positions.', confidence: 'Estimated decade.' },
      { label: 'LG dryers', pattern: 'Year digit + month digits', meaning: 'The opening three characters usually drive the age estimate.', confidence: 'Estimated decade.' },
      { label: 'Samsung dryers', pattern: '11-char or 15-char serial', meaning: 'Year and month positions depend on serial length.', confidence: 'Estimated when repeated year codes appear.' }
    ],
    exampleSectionTitle: 'Dryer serial number examples',
    examples: [
      { label: 'Supported Whirlpool example', serial: 'CB2501800', note: 'Supported Whirlpool-family example. The code positions can resolve a week-based production window once the brand is confirmed.' },
      { label: 'Illustrative LG pattern', serial: '810XXXXXXX', note: 'Illustrative LG dryer pattern. The opening year digit and month digits are the supported logic positions in the current decoder.' },
      { label: 'Illustrative GE pattern', serial: 'AZ123456', note: 'Illustrative GE dryer pattern. The opening letters are usually the important month/year positions rather than the trailing digits.' }
    ],
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
      ['How do I find the age of my dryer?', 'Use the serial number on the product tag after selecting the correct brand in the decoder.'],
      ['What can the dryer model number tell me?', 'It can identify the family, configuration, and sometimes the OEM platform behind the dryer.'],
      ['Why does my dryer serial number not decode?', 'The most common reasons are a hidden or worn label, the wrong brand path, or a year code that still needs era context.'],
      ['Where is the dryer serial number located?', 'Most dryers place it around the door opening, cabinet edge, or rear panel.'],
      ['Can this support insurance documentation?', 'Yes. Serial-based age support is useful, but repeated year codes should still be labeled as estimated until the decade is confirmed.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Dryer Path'],
      ['maytag-serial-number-lookup', 'Maytag Dryer Path'],
      ['ge-serial-number-lookup', 'GE Dryer Path'],
      ['lg-serial-number-lookup', 'LG Dryer Path'],
      ['samsung-serial-number-lookup', 'Samsung Dryer Path']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'dishwasher-serial-number',
    title: 'Dishwasher Serial Number Lookup | Decode Age & Model Info',
    description: 'Find dishwasher serial number labels, decode supported brand formats, and use model-number context when the dishwasher serial result stays estimated.',
    h1: 'Dishwasher Serial Number Lookup',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Use this dishwasher serial number lookup page to find the label, decode supported serial formats, and move into the strongest brand path when the age code depends on the manufacturer.',
    supportingIntro: 'Dishwasher age checks usually start with the serial number on the door frame or tub lip. The model number helps confirm the product family or OEM source when the serial format repeats or when the brand is private-label.',
    decoderIntro: 'Select the dishwasher brand and enter the serial exactly as printed.',
    decoderPlaceholder: 'Enter dishwasher serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'Supported dishwasher serial numbers can reveal a year, a production week, or a month-year window. That is usually the fastest way to estimate appliance age when service paperwork is missing.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The dishwasher model number helps identify the product family, trim, and OEM platform. It becomes more important when the serial code alone does not fully resolve the decade or when the dishwasher is sold under a private label.',
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
      { label: 'Supported Bosch example', serial: 'FD911100449', note: 'Supported Bosch-family FD example. This is one of the clearer dishwasher date paths because the FD code points to year and month more directly.' },
      { label: 'Supported Whirlpool example', serial: 'CB2501800', note: 'Supported Whirlpool-family example. The date logic uses year code plus production week rather than a direct calendar month.' },
      { label: 'Illustrative Frigidaire pattern', serial: 'VF24012345', note: 'Illustrative Frigidaire dishwasher pattern. The factory letters matter before the year and week positions are read.' }
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
      ['How do I find the age of my dishwasher?', 'Open the door, locate the product tag on the frame or tub edge, and decode the serial number after selecting the correct brand.'],
      ['What can the dishwasher model number tell me?', 'It usually identifies the product family and can help confirm the OEM platform or generation when the serial result stays estimated.'],
      ['Why does my dishwasher serial number not decode?', 'Common reasons are a worn tag, the wrong brand path, an OEM/private-label mismatch, or a repeating year code.'],
      ['Where is the dishwasher serial number label located?', 'Most dishwashers place it on the inner door frame, tub lip, or side edge that is visible when the door is open.'],
      ['Can I use this for claims or replacement research?', 'Yes. The result is useful for age support and replacement planning, especially when paired with the model number and product type.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['bosch', 'Bosch Dishwasher Path'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Dishwasher Path'],
      ['ge-serial-number-lookup', 'GE Dishwasher Path'],
      ['frigidaire-serial-number-lookup', 'Frigidaire Dishwasher Path'],
      ['samsung-serial-number-lookup', 'Samsung Dishwasher Path']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'range-oven-serial-number',
    title: 'Range & Oven Serial Number Lookup | Find Age & Model Info',
    description: 'Find range and oven serial number labels, decode supported brand formats, and use model-number context to estimate cooking-appliance age.',
    h1: 'Range & Oven Serial Number Lookup',
    badge: 'Appliance type guide',
    category: 'appliances',
    brandValue: '',
    intro: 'Use this range and oven serial number lookup page when you need to find the label, decode supported cooking-appliance formats, or move from a model number into the right brand path.',
    supportingIntro: 'Cooking products often hide the label behind the oven door, around the frame, or behind the lower drawer. The serial number usually drives the age estimate, while the model number helps confirm the product family and era.',
    decoderIntro: 'Select the cooking-appliance brand and enter the serial number exactly as shown.',
    decoderPlaceholder: 'Enter range or oven serial number',
    decodeSectionTitle: 'What the serial number can tell you',
    decodeSectionBody: 'Supported range and oven serial numbers can point to a manufacturing year, production week, or month-year window. That is often enough to document age when the install date is uncertain.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The model number helps identify wall oven versus freestanding range, fuel type, and product generation. It is especially useful when the serial code repeats across decades or when the product line spans multiple factories.',
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
      { label: 'Supported Whirlpool example', serial: 'CB2501800', note: 'Supported Whirlpool-family example. The serial can resolve a week-based production window after the correct brand path is selected.' },
      { label: 'Illustrative GE pattern', serial: 'AZ123456', note: 'Illustrative GE range pattern. The opening letters are usually the meaningful date positions.' },
      { label: 'Illustrative Frigidaire pattern', serial: 'VF24012345', note: 'Illustrative Frigidaire cooking-product pattern. The factory letters matter before the year and week digits are interpreted.' }
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
      ['How do I find the age of my range or oven?', 'Locate the product tag behind the door or drawer opening, select the correct brand, and decode the serial number.'],
      ['What can the model number tell me?', 'It usually identifies the family, fuel type, and generation, which helps when the serial code alone cannot lock the decade.'],
      ['Why does my range or oven serial number not decode?', 'Common reasons are a hidden or damaged label, the wrong brand path, or a serial code that repeats across multiple decades.'],
      ['Where is the serial number label located on a range or wall oven?', 'Most products place it on the oven frame, behind the door, or inside the lower drawer opening.'],
      ['Can this support replacement research?', 'Yes. It is useful for age estimates, replacement planning, and claim documentation when the result is labeled correctly as exact or estimated.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['ge-serial-number-lookup', 'GE Cooking Product Path'],
      ['whirlpool-serial-number-lookup', 'Whirlpool Cooking Product Path'],
      ['frigidaire-serial-number-lookup', 'Frigidaire Cooking Product Path'],
      ['samsung-serial-number-lookup', 'Samsung Cooking Product Path'],
      ['lg-serial-number-lookup', 'LG Cooking Product Path']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'whirlpool-serial-number-lookup',
    title: 'Whirlpool Serial Number Decoder',
    description: 'Decode Whirlpool serial numbers, estimate Whirlpool appliance age, and use supported year/week patterns for refrigerators, washers, dryers, dishwashers, and ranges.',
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
    formatSectionTitle: 'Common Whirlpool serial number formats',
    formats: [
      { label: '9-character Whirlpool serial', pattern: 'Year code in character 2; week digits in characters 3-4', meaning: 'The year code maps the likely year window and the next two digits point to the production week.', confidence: 'Estimated decade. Whirlpool year codes repeat.' },
      { label: '10-character Whirlpool serial', pattern: 'Year code in character 3; week digits in characters 4-5', meaning: 'The serial length changes where Whirlpool stores the year code.', confidence: 'Estimated decade. Whirlpool year codes repeat.' },
      { label: 'Whirlpool-family brands', pattern: 'Same core year/week logic across many related brands', meaning: 'KitchenAid, Roper, and some Kenmore OEM paths often follow similar Whirlpool-family logic.', confidence: 'Estimated until the exact family and era are clear.' }
    ],
    exampleSectionTitle: 'Whirlpool serial number examples',
    examples: [
      { label: 'Supported example', serial: 'CB2501800', note: 'This is a supported Whirlpool-family example from the current decoder data. The code structure reveals a year window and production week.' },
      { label: 'Illustrative 10-character pattern', serial: 'ABC2501800', note: 'Illustrative 10-character Whirlpool-family pattern. The current decoder uses character 3 for year and characters 4-5 for production week on this structure.' },
      { label: 'Cycle warning', serial: '...B25...', note: 'A Whirlpool year code such as B can map to more than one decade cycle, which is why the result may still be estimated until model era or install context confirms the right decade.' }
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
      ['How old is my Whirlpool appliance?', 'Use the full serial number from the rating label. Whirlpool usually stores a year code and production week in the serial rather than the model number.'],
      ['Can a Whirlpool model number tell me the age?', 'Not reliably by itself. The model number is more useful for identifying the family and confirming the era when year codes repeat.'],
      ['Why does Whirlpool show an estimated decade?', 'Whirlpool year codes repeat across long cycles, so condition, product era, and model family may still be needed to confirm the right decade.'],
      ['Where is the Whirlpool serial number label located?', 'It depends on product type. Refrigerators usually place it inside the cabinet, laundry products place it around the opening, and dishwashers or ranges place it on the frame.'],
      ['Can this be used for insurance claims?', 'Yes. Just document whether the result is a direct supported decode or an estimated decade based on the repeated Whirlpool cycle.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['washer-serial-number', 'Washer Serial Number Lookup'],
      ['dishwasher-serial-number', 'Dishwasher Serial Number Lookup'],
      ['maytag-serial-number-lookup', 'Maytag'],
      ['kenmore-serial-number-lookup', 'Kenmore']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'ge-serial-number-lookup',
    title: 'GE Serial Number Decoder',
    description: 'Decode GE serial numbers, estimate GE appliance age, and use the supported GE month/year letter pattern for refrigerators, dishwashers, laundry, ranges, and ovens.',
    h1: 'GE Serial Number Decoder',
    badge: 'Brand decoder',
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
      { label: 'Appliance-family reminder', serial: 'Opening letters matter most', note: 'The serial sequence after the first two letters is usually production tracking rather than the core age signal on GE-family appliances.' }
    ],
    locationSectionTitle: 'Where to find the model and serial number',
    locations: [
      { title: 'Refrigerators', items: ['Inside the fresh-food section side wall', 'Behind a drawer or on upper interior trim in some models'] },
      { title: 'Laundry products', items: ['Washer lid opening or underside of the lid', 'Dryer door opening or rear cabinet label'] },
      { title: 'Ranges and dishwashers', items: ['Range frame behind the oven door or drawer opening', 'Dishwasher inner door frame or tub edge'] }
    ],
    problemSectionTitle: 'If the serial number does not decode',
    problems: [
      'Double-check the opening serial letters because those are usually the important GE date positions.',
      'Use the model number and product type to confirm the decade when the year letter repeats.',
      'Try Smart Lookup if the opening letters are worn or missing.',
      'Do not treat Samsung, LG, or Whirlpool serial logic as interchangeable with GE.',
      'Capture the full serial even if the main age clue is at the front of the code.'
    ],
    faqs: [
      ['How old is my GE appliance?', 'Use the serial number from the label. GE usually stores the age signal in the opening month and year letters rather than the model number.'],
      ['Can the GE model number tell me the age?', 'Not reliably by itself. It is better for identifying the family and confirming the likely decade when the serial year letter repeats.'],
      ['Why does the GE result still look estimated?', 'GE year letters repeat, so the decoder may still need model-family or installation-era context to confirm the decade.'],
      ['Where is the GE serial number label located?', 'Most GE appliances place it on an interior frame, cabinet wall, or opening edge depending on product type.'],
      ['Can this support claim documentation?', 'Yes. Just note when the decade is still estimated because the GE year code repeats across multiple cycles.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['dishwasher-serial-number', 'Dishwasher Serial Number Lookup'],
      ['range-oven-serial-number', 'Range & Oven Serial Number Lookup'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['frigidaire-serial-number-lookup', 'Frigidaire']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'samsung-serial-number-lookup',
    title: 'Samsung Serial Number Decoder',
    description: 'Decode Samsung appliance serial numbers, estimate appliance age, and use the supported 11-character and 15-character Samsung serial formats with clear confidence notes.',
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
      { label: 'Category reminder', serial: 'Appliance serials only on this page', note: 'Samsung TVs use a related but separate route. Use the appliance page only when the product is a refrigerator, washer, dryer, dishwasher, range, or oven.' }
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
      ['Can this support claim documentation?', 'Yes. It is useful for age support and replacement research, especially when the product category is clear and the full serial is available.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['washer-serial-number', 'Washer Serial Number Lookup'],
      ['dishwasher-serial-number', 'Dishwasher Serial Number Lookup'],
      ['samsung-tv-serial-number-decoder', 'Samsung TV Serial Number Decoder'],
      ['lg-serial-number-lookup', 'LG']
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
    formatSectionTitle: 'Common LG serial number formats',
    formats: [
      { label: '8-12 character LG appliance serials', pattern: 'Year digit in character 1; month digits in characters 2-3', meaning: 'The opening digit and next two month digits usually drive the supported LG age estimate.', confidence: 'Estimated decade. LG year digits repeat.' },
      { label: 'LG refrigerators', pattern: 'Same opening year/month pattern', meaning: 'Refrigerators commonly follow the same first-digit year and two-digit month logic.', confidence: 'Estimated decade.' },
      { label: 'LG laundry and kitchen products', pattern: 'Same opening year/month pattern', meaning: 'Washers, dryers, dishwashers, and ranges often use the same opening LG date structure.', confidence: 'Estimated decade.' }
    ],
    exampleSectionTitle: 'LG serial number examples',
    examples: [
      { label: 'Illustrative LG pattern', serial: '810XXXXXXX', note: 'Illustrative LG appliance pattern. The supported decoder treats 8 as the year digit and 10 as the month code.' },
      { label: 'Decade reminder', serial: '1 02 ...', note: 'An LG year digit such as 1 can represent more than one decade cycle, which is why model era still matters.' },
      { label: 'Appliance-family reminder', serial: 'Opening digits matter most', note: 'The opening LG serial characters are usually the main age signal, while the remaining characters track line and sequence information.' }
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
      ['How old is my LG appliance?', 'Use the serial number from the label. The supported LG decoder reads the opening year digit and month digits, then uses model-era context when the decade repeats.'],
      ['Can the LG model number tell me the age?', 'Not reliably by itself. It is better for identifying the family and helping resolve the decade when the year digit repeats.'],
      ['Why does the LG result still look estimated?', 'The first serial digit is only the last digit of the year, so the decoder may still need model-era context to confirm the full decade.'],
      ['Where is the LG serial number label located?', 'LG usually places it inside the appliance opening, on the cabinet wall, or on the interior frame depending on product type.'],
      ['Can this support claim documentation?', 'Yes. The result is useful for age support, replacement research, and documenting whether the final decade is direct or estimated.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['washer-serial-number', 'Washer Serial Number Lookup'],
      ['range-oven-serial-number', 'Range & Oven Serial Number Lookup'],
      ['samsung-serial-number-lookup', 'Samsung'],
      ['ge-serial-number-lookup', 'GE']
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
    formatSectionTitle: 'Common Frigidaire serial number formats',
    formats: [
      { label: 'Frigidaire refrigerators', pattern: 'Factory letters followed by year digit + week digits', meaning: 'The first numeric character after the plant code is often the year digit, followed by week information.', confidence: 'Estimated decade. Product line matters.' },
      { label: 'Frigidaire laundry products', pattern: 'Same factory-letter + year/week structure', meaning: 'Washers and dryers often use the same main timing structure.', confidence: 'Estimated decade.' },
      { label: 'Frigidaire dishwashers and ranges', pattern: 'Same factory-letter + year/week structure', meaning: 'Cooking and dishwashing products usually follow the same year-digit and week-digit approach.', confidence: 'Estimated decade.' }
    ],
    exampleSectionTitle: 'Frigidaire serial number examples',
    examples: [
      { label: 'Illustrative Frigidaire pattern', serial: 'VF24012345', note: 'Illustrative Frigidaire-family pattern. The factory letters matter before the year and week digits are interpreted.' },
      { label: 'Plant-code reminder', serial: 'Factory letters stay in the serial', note: 'Do not drop the opening letters. They help define the correct Frigidaire-family decode path.' },
      { label: 'Decade reminder', serial: 'Year digit can repeat', note: 'The supported Frigidaire year digit can overlap more than one decade, so model era can still matter.' }
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
      ['How old is my Frigidaire appliance?', 'Use the serial number from the label. The supported Frigidaire path usually reads a year digit and production week after the factory letters.'],
      ['Can the Frigidaire model number tell me the age?', 'Not reliably by itself. It is mainly used to confirm the product family and likely decade when the serial year digit repeats.'],
      ['Why does the Frigidaire result still look estimated?', 'The Frigidaire year digit can still overlap more than one decade, so model-family and product-era context may still be needed.'],
      ['Where is the Frigidaire serial number label located?', 'Frigidaire usually places it on the interior cabinet wall, opening edge, or product frame depending on category.'],
      ['Can this support claim documentation?', 'Yes. It is useful for age support and replacement research, especially when the full serial and product type are available.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['refrigerator-serial-number', 'Refrigerator Serial Number Lookup'],
      ['dishwasher-serial-number', 'Dishwasher Serial Number Lookup'],
      ['range-oven-serial-number', 'Range & Oven Serial Number Lookup'],
      ['ge-serial-number-lookup', 'GE'],
      ['whirlpool-serial-number-lookup', 'Whirlpool']
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
    formatSectionTitle: 'Common Maytag serial number formats',
    formats: [
      { label: 'Post-2006 Maytag', pattern: 'Whirlpool-style year code + week digits', meaning: 'Many modern Maytag products follow Whirlpool-family year/week logic.', confidence: 'Estimated decade. Era can still matter.' },
      { label: 'Pre-2006 Maytag', pattern: 'Second-to-last character for year, last character for month', meaning: 'Legacy Maytag products often store year and month at the end of the serial.', confidence: 'Estimated until era is confirmed.' },
      { label: 'Maytag product-family overlap', pattern: 'Laundry and kitchen products can appear in either path', meaning: 'The current decoder asks for an era when the serial structure alone is not enough to pick the right family.', confidence: 'Estimated until the right era is chosen.' }
    ],
    exampleSectionTitle: 'Maytag serial number examples',
    examples: [
      { label: 'Post-2006 style reminder', serial: '...year code + week...', note: 'Many newer Maytag appliances route into Whirlpool-family year/week logic after the era is confirmed.' },
      { label: 'Legacy style reminder', serial: '...XY', note: 'Some older Maytag products use the ending characters for year and month rather than the opening positions.' },
      { label: 'Era selector reminder', serial: 'Context matters', note: 'If the page asks for era, use the product age range, styling, or install date to choose the right Maytag decode path.' }
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
      ['How old is my Maytag appliance?', 'Use the serial number from the label. The current decoder supports both Whirlpool-era Maytag logic and older legacy logic when the era is known.'],
      ['Can the Maytag model number tell me the age?', 'It is more useful for confirming the platform and era than for direct date decoding.'],
      ['Why does the Maytag page ask for era?', 'Some Maytag serial layouts repeat or change by production era, so the correct path sometimes depends on whether the appliance is pre-2006 or post-2006.'],
      ['Where is the Maytag serial number label located?', 'Maytag usually places it on the interior opening, cabinet wall, or product frame depending on category.'],
      ['Can this support claim documentation?', 'Yes. It is useful for age support, but any era-based assumption should be documented when the serial family overlaps.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['washer-serial-number', 'Washer Serial Number Lookup'],
      ['dryer-serial-number', 'Dryer Serial Number Lookup'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['kenmore-serial-number-lookup', 'Kenmore'],
      ['ge-serial-number-lookup', 'GE']
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
      { label: 'Model prefix reminder', serial: '106.xxxxx', note: 'A prefix like 106 often signals Whirlpool-family routing before the serial is decoded.' },
      { label: 'Model prefix reminder', serial: '362.xxxxx', note: 'A prefix like 362 often signals a GE-family path, where the opening serial letters carry the main age logic.' },
      { label: 'OEM-routing reminder', serial: 'Serial alone is not always enough', note: 'If the OEM is unknown, the decoder may still leave the result estimated until the model family is clearer.' }
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
      ['How old is my Kenmore appliance?', 'Use the model prefix to identify the OEM first, then decode the serial using the supported manufacturer path.'],
      ['Can the Kenmore serial number tell me the age by itself?', 'Sometimes, but the model prefix is often needed first because Kenmore products were built by multiple OEM manufacturers.'],
      ['Why does Kenmore need the model number more than other brands?', 'The model prefix often identifies who actually manufactured the appliance, and that decides which serial rule the decoder should apply.'],
      ['Where is the Kenmore serial number label located?', 'Kenmore labels usually follow the same placement patterns as the underlying OEM product type: inside the cabinet, around the opening, or on the frame.'],
      ['Can this support claim documentation?', 'Yes. Just note when the OEM is confirmed directly versus when the result still depends on a likely model-prefix match.']
    ],
    relatedLinks: [
      ['how-old-is-my-appliance', 'How Old Is My Appliance?'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['ge-serial-number-lookup', 'GE'],
      ['lg-serial-number-lookup', 'LG'],
      ['frigidaire-serial-number-lookup', 'Frigidaire'],
      ['find-model-serial-number', 'Find Model & Serial Labels']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'carrier-serial-number-lookup',
    title: 'Carrier Serial Number Decoder',
    description: 'Decode Carrier serial numbers, estimate HVAC age, and use the supported Carrier year-position logic with concise rating-plate guidance.',
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
    modelSectionBody: 'The Carrier model number helps confirm equipment family, tonnage, and product generation. That becomes useful when the serial fits a supported year position but you still need model-era context for a stronger replacement or claim summary.',
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
      { label: 'HVAC context reminder', serial: 'Model family still helps', note: 'The model number helps verify the product generation and supports replacement research after the serial date is estimated.' }
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
      'Do not apply appliance-style month/year rules to HVAC equipment.'
    ],
    faqs: [
      ['How old is my Carrier unit?', 'Use the serial number from the rating plate. The supported Carrier path commonly reads digits 3-4 as the production year.'],
      ['Can the Carrier model number tell me the age?', 'Not as directly as the serial number. It is better for identifying the family and supporting replacement research.'],
      ['Why does my Carrier serial number not decode?', 'The label may be partial, the product may follow a different family, or the serial may fall outside the supported Carrier path.'],
      ['Where is the Carrier serial number plate located?', 'Most Carrier equipment places it on the outdoor cabinet, indoor access panel, or furnace service area depending on product type.'],
      ['Can this support claim documentation?', 'Yes. Serial-based age support is useful for HVAC claims, especially when the rating plate photo is saved with the file.']
    ],
    relatedLinks: [
      ['how-to-find-hvac-age', 'How to Find HVAC Age'],
      ['hvac-age-by-serial-number', 'HVAC Age by Serial Number'],
      ['trane-serial-number-lookup', 'Trane'],
      ['rheem-serial-number-lookup', 'Rheem'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['how-old-is-my-appliance', 'How Old Is My Appliance?']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'trane-serial-number-lookup',
    title: 'Trane Serial Number Decoder',
    description: 'Decode Trane serial numbers, estimate HVAC age, and use the supported Trane year-position logic with concise rating-plate guidance.',
    h1: 'Trane Serial Number Decoder',
    badge: 'HVAC brand decoder',
    category: 'hvac',
    brandValue: 'trane',
    intro: 'Use this Trane serial number decoder when you already know the brand and want the fastest supported HVAC age path from the rating plate.',
    supportingIntro: 'Trane serial numbers are equipment-specific HVAC paths. The current decoder supports the common Trane year-position logic and keeps the result focused on rating-plate serial research instead of generic product guessing.',
    decoderIntro: 'Trane is preselected. Enter the full HVAC serial number exactly as printed on the rating plate.',
    decoderPlaceholder: 'Enter Trane serial number',
    decodeSectionTitle: 'How to decode a Trane serial number',
    decodeSectionBody: 'Supported Trane serial decoding commonly uses digits 3-4 as the production year. The surrounding characters usually act as plant and sequence identifiers rather than a direct month code.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The Trane model number helps confirm equipment family, tonnage, and generation. That supports a stronger replacement workflow once the serial estimate identifies the likely year.',
    formatSectionTitle: 'Common Trane serial number formats',
    formats: [
      { label: 'Trane condensers and heat pumps', pattern: 'Digits 3-4 commonly map the year', meaning: 'The current decoder uses the supported Trane year position instead of a generic month-year guess.', confidence: 'Moderate to high confidence when the label matches the supported path.' },
      { label: 'Trane furnaces', pattern: 'Digits 3-4 commonly map the year', meaning: 'Furnaces often follow the same supported Trane year placement.', confidence: 'Moderate to high confidence.' },
      { label: 'Trane indoor units', pattern: 'Same supported year position', meaning: 'Air handlers and indoor units often use the same year-position logic.', confidence: 'Moderate to high confidence.' }
    ],
    exampleSectionTitle: 'Trane serial number examples',
    examples: [
      { label: 'Illustrative Trane pattern', serial: 'XX19XXXXX', note: 'Illustrative Trane-family pattern. The supported path focuses on digits 3-4 for the production year.' },
      { label: 'Rating-plate reminder', serial: 'Full serial required', note: 'Capture the whole serial because the surrounding characters help confirm you are using the right Trane path.' },
      { label: 'Model-family reminder', serial: 'Model still matters', note: 'The Trane model number is useful for verifying the family and building a stronger replacement summary after the year is estimated.' }
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
      ['How old is my Trane unit?', 'Use the serial number from the rating plate. The supported Trane path commonly reads digits 3-4 as the production year.'],
      ['Can the Trane model number tell me the age?', 'Not as directly as the serial number. It is better for identifying the equipment family and supporting replacement research.'],
      ['Why does my Trane serial number not decode?', 'The label may be partial, the product may fall outside the supported family, or the serial may not match the main Trane pattern.'],
      ['Where is the Trane serial number plate located?', 'Most Trane equipment places it on the outdoor cabinet, indoor access panel, or furnace service area depending on product type.'],
      ['Can this support claim documentation?', 'Yes. Serial-based age support is useful for HVAC claims, especially when the rating-plate photo is preserved.']
    ],
    relatedLinks: [
      ['how-to-find-hvac-age', 'How to Find HVAC Age'],
      ['hvac-age-by-serial-number', 'HVAC Age by Serial Number'],
      ['carrier-serial-number-lookup', 'Carrier'],
      ['rheem-serial-number-lookup', 'Rheem'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['how-old-is-my-appliance', 'How Old Is My Appliance?']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'rheem-serial-number-lookup',
    title: 'Rheem Serial Number Decoder',
    description: 'Decode Rheem serial numbers, estimate HVAC age, and use the supported week/year Rheem HVAC pattern with concise rating-plate guidance.',
    h1: 'Rheem Serial Number Decoder',
    badge: 'HVAC brand decoder',
    category: 'hvac',
    brandValue: 'rheem',
    intro: 'Use this Rheem serial number decoder when you already know the brand and want the fastest supported HVAC age path from the rating plate.',
    supportingIntro: 'Rheem HVAC serial numbers commonly include a week/year block after a leading letter. The current decoder supports that pattern and keeps the result focused on equipment age rather than generic model guessing.',
    decoderIntro: 'Rheem is preselected. Enter the full HVAC serial number exactly as printed on the rating plate.',
    decoderPlaceholder: 'Enter Rheem serial number',
    decodeSectionTitle: 'How to decode a Rheem serial number',
    decodeSectionBody: 'Supported Rheem HVAC serial decoding commonly looks for a four-digit week/year block after an opening letter. In many supported cases, the first two digits of that block point to production week and the next two point to year.',
    modelSectionTitle: 'What the model number can tell you',
    modelSectionBody: 'The Rheem model number helps confirm equipment family, tonnage, and generation. That supports replacement research and helps explain the context of an estimated week/year result.',
    formatSectionTitle: 'Common Rheem serial number formats',
    formats: [
      { label: 'Rheem HVAC serials', pattern: 'Letter + WWYY block', meaning: 'The supported path often reads the first four digits after an opening letter as production week and year.', confidence: 'Moderate to high confidence when the label matches the supported path.' },
      { label: 'Rheem indoor and outdoor equipment', pattern: 'Same week/year block logic', meaning: 'Air conditioners, heat pumps, and indoor units often follow the same supported week/year structure.', confidence: 'Moderate to high confidence.' },
      { label: 'Rheem product-family reminder', pattern: 'Full serial still matters', meaning: 'The opening letter and full rating-plate string help confirm you are using the right supported Rheem path.', confidence: 'High confidence on workflow.' }
    ],
    exampleSectionTitle: 'Rheem serial number examples',
    examples: [
      { label: 'Illustrative Rheem pattern', serial: 'A2514XXXXX', note: 'Illustrative Rheem-family pattern. The supported path treats 25 as the week and 14 as the year when the serial matches this structure.' },
      { label: 'Week/year reminder', serial: 'WWYY block', note: 'Rheem HVAC age estimates often resolve to a production week instead of a direct calendar month.' },
      { label: 'Model-family reminder', serial: 'Model still helps', note: 'The Rheem model number is useful for tonnage and replacement-family research after the serial year is estimated.' }
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
      ['How old is my Rheem unit?', 'Use the serial number from the rating plate. The supported Rheem HVAC path commonly looks for a week/year block after the opening letter.'],
      ['Can the Rheem model number tell me the age?', 'Not as directly as the serial number. It is better for identifying the family and helping with replacement research.'],
      ['Why does my Rheem serial number not decode?', 'The serial may be partial, the label may be damaged, or the product may follow a different family than the supported HVAC path.'],
      ['Where is the Rheem serial number plate located?', 'Most Rheem HVAC equipment places it on the outdoor cabinet or indoor access panel depending on product type.'],
      ['Can this support claim documentation?', 'Yes. Serial-based age support is useful for HVAC claims, especially when the rating-plate photo is saved with the file.']
    ],
    relatedLinks: [
      ['how-to-find-hvac-age', 'How to Find HVAC Age'],
      ['hvac-age-by-serial-number', 'HVAC Age by Serial Number'],
      ['carrier-serial-number-lookup', 'Carrier'],
      ['trane-serial-number-lookup', 'Trane'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['how-old-is-my-appliance', 'How Old Is My Appliance?']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'goodman-serial-number-lookup',
    title: 'Goodman Serial Number Decoder',
    description: 'Decode Goodman serial numbers, estimate HVAC age, and use the supported Goodman year/month format with concise rating-plate guidance.',
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
    modelSectionBody: 'The Goodman model number helps confirm equipment family, tonnage, and replacement class. It is useful for downstream replacement research even when the serial result itself is relatively direct.',
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
      { label: 'Rating-plate reminder', serial: 'Full serial required', note: 'Capture the full serial anyway because the complete label still helps with replacement and claim documentation.' }
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
      'Do not apply appliance-style serial logic to HVAC equipment.'
    ],
    faqs: [
      ['How old is my Goodman unit?', 'Use the serial number from the rating plate. The supported Goodman path commonly reads the first two digits as year and the next two as month.'],
      ['Can the Goodman model number tell me the age?', 'Not as directly as the serial number. It is better for identifying the family and supporting replacement research.'],
      ['Why does my Goodman serial number not decode?', 'The label may be partial, damaged, or outside the supported Goodman path.'],
      ['Where is the Goodman serial number plate located?', 'Most Goodman equipment places it on the outdoor cabinet, furnace service area, or indoor access panel depending on product type.'],
      ['Can this support claim documentation?', 'Yes. The Goodman serial result is useful for HVAC claims, especially when the rating-plate photo is kept with the file.']
    ],
    relatedLinks: [
      ['how-to-find-hvac-age', 'How to Find HVAC Age'],
      ['hvac-age-by-serial-number', 'HVAC Age by Serial Number'],
      ['carrier-serial-number-lookup', 'Carrier'],
      ['trane-serial-number-lookup', 'Trane'],
      ['rheem-serial-number-lookup', 'Rheem'],
      ['how-old-is-my-appliance', 'How Old Is My Appliance?']
    ],
    linkGroups: baseLinkGroups()
  },
  {
    slug: 'asus-serial-number-decoder',
    title: 'ASUS Serial Number Lookup & Model Number Help',
    description: 'Use ASUS serial number lookup, ASUS model number lookup, and ASUS laptop serial number guidance to estimate manufacture date and identify supported ASUS device families.',
    h1: 'ASUS Serial Number Lookup & Model Number Help',
    badge: 'Electronics brand decoder',
    category: 'electronics',
    brandValue: 'asus',
    intro: 'Use this ASUS serial number lookup page when you need to find the label, estimate manufacture date, or move from an ASUS model number into the supported electronics decoder path.',
    supportingIntro: 'This page targets ASUS electronics intent, not appliance intent. The supported ASUS serial logic uses the first character for year code and the second character for month, while the model number helps narrow device family, generation, and warranty-style identification workflows.',
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
    formatSectionTitle: 'Common ASUS serial number formats',
    formats: [
      { label: 'ASUS laptop serials', pattern: 'Year code in character 1; month code in character 2', meaning: 'The supported path reads the opening year and month code directly from the serial.', confidence: 'Moderate confidence. Use model family to confirm full year.' },
      { label: 'ASUS motherboard serials', pattern: 'Same opening year/month code logic', meaning: 'Motherboards often rely on the same supported ASUS opening-code structure.', confidence: 'Moderate confidence.' },
      { label: 'ASUS desktops and displays', pattern: 'Same opening year/month code logic', meaning: 'The model number is still useful for product-family identification and warranty-style lookup after the serial age estimate.', confidence: 'Moderate confidence.' }
    ],
    exampleSectionTitle: 'ASUS serial number examples',
    examples: [
      { label: 'Illustrative ASUS pattern', serial: 'NBN1234567', note: 'Illustrative ASUS serial pattern. The supported path reads character 1 as year code and character 2 as month code, with A/B/C representing October through December.' },
      { label: 'Model-number reminder', serial: 'UX3402 / ROG / PRIME families', note: 'The ASUS model number helps narrow the device family and generation after the serial age estimate is returned.' },
      { label: 'Warranty-style lookup reminder', serial: 'Serial + model works best', note: 'For support or warranty-style identification, keep both the ASUS serial number and the ASUS model number together.' }
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
      ['How do I find an ASUS laptop serial number?', 'Check the bottom case, the original box, BIOS, or system information. Older units may also place it under the battery or on an underside label.'],
      ['Can the ASUS model number help if the serial is missing?', 'Yes. The model number is useful for device-family identification, generation research, and Smart Lookup when the serial label is not readable.'],
      ['Does this work for ASUS motherboards?', 'Yes. The supported ASUS serial logic can be used when the motherboard serial label is available, and the model number helps narrow the platform.'],
      ['Can this page help with ASUS warranty or identification intent?', 'Yes. The best workflow is to keep both the serial and model number together, especially for support, resale, or documentation needs.'],
      ['Does this page target appliances?', 'No. This page is intentionally ASUS electronics-focused and does not target appliance age keywords.']
    ],
    relatedLinks: [
      ['find-model-serial-number', 'Find Model & Serial Labels'],
      ['samsung-tv-serial-number-decoder', 'Samsung TV Serial Number Decoder'],
      ['hp', 'HP'],
      ['apple', 'Apple'],
      ['electronics', 'Electronics Hub'],
      ['how-old-is-my-appliance', 'How Old Is My Appliance?']
    ],
    linkGroups: baseLinkGroups()
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
  ['/how-to-find-hvac-age', 'monthly', '0.8'],
  ['/how-to-read-serial-number', 'monthly', '0.8'],
  ['/hvac-age-by-serial-number', 'monthly', '0.8'],
  ['/methodology', 'monthly', '0.5'],
  ['/privacy-policy', 'yearly', '0.3'],
  ['/security', 'yearly', '0.3'],
  ['/smart-lookup', 'weekly', '0.9'],
  ['/appliance-age-estimator', 'monthly', '0.6'],
  ['/replacement-lookup', 'monthly', '0.6'],
  ['/hvac-replacement-guide', 'monthly', '0.6'],
  ['/tv-replacement-guide', 'monthly', '0.6'],
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
  ['/whirlpool-model-number-lookup', 'monthly', '0.6'],
  ['/goodman-model-number-lookup', 'monthly', '0.6'],
  ['/whirlpool-refrigerator-serial-number-lookup', 'monthly', '0.6'],
  ['/whirlpool-dishwasher-serial-number-lookup', 'monthly', '0.6']
];

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
  fs.writeFileSync(path.join(root, `${page.slug}.html`), renderPage(page));
});

fs.writeFileSync(path.join(root, 'sitemap.xml'), renderSitemap(sitemapEntries));

console.log(`Generated ${pages.length} SEO pages and refreshed sitemap.xml.`);
