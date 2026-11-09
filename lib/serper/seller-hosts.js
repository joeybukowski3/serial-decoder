export const SOURCE_CLASS = Object.freeze({ MANUFACTURER: 'MANUFACTURER', RETAILER: 'RETAILER', REVIEW: 'REVIEW', TECH_DATABASE: 'TECH_DATABASE', MARKETPLACE: 'MARKETPLACE' });

// Host -> [class, display name]. Mirrors the replacement-discovery registries (a test keeps them in step) plus review and marketplace hosts.
// The frontend proxy keeps a generated copy of this table (scripts/itemassist-research-export.mjs writes it and checks it for drift).
export const SOURCE_REGISTRY = Object.freeze([
  ['samsung.com', SOURCE_CLASS.MANUFACTURER, 'Samsung'], ['lg.com', SOURCE_CLASS.MANUFACTURER, 'LG'], ['sony.com', SOURCE_CLASS.MANUFACTURER, 'Sony'],
  ['tcl.com', SOURCE_CLASS.MANUFACTURER, 'TCL'], ['hisense-usa.com', SOURCE_CLASS.MANUFACTURER, 'Hisense'], ['hisense.com', SOURCE_CLASS.MANUFACTURER, 'Hisense'],
  ['vizio.com', SOURCE_CLASS.MANUFACTURER, 'Vizio'], ['insigniaproducts.com', SOURCE_CLASS.MANUFACTURER, 'Insignia'],
  ['geappliances.com', SOURCE_CLASS.MANUFACTURER, 'GE Appliances'], ['ge.com', SOURCE_CLASS.MANUFACTURER, 'GE'], ['whirlpool.com', SOURCE_CLASS.MANUFACTURER, 'Whirlpool'],
  ['frigidaire.com', SOURCE_CLASS.MANUFACTURER, 'Frigidaire'], ['kitchenaid.com', SOURCE_CLASS.MANUFACTURER, 'KitchenAid'], ['bosch-home.com', SOURCE_CLASS.MANUFACTURER, 'Bosch'],
  ['subzero-wolf.com', SOURCE_CLASS.MANUFACTURER, 'Sub-Zero'], ['maytag.com', SOURCE_CLASS.MANUFACTURER, 'Maytag'],
  ['bestbuy.com', SOURCE_CLASS.RETAILER, 'Best Buy'], ['homedepot.com', SOURCE_CLASS.RETAILER, 'The Home Depot'], ['lowes.com', SOURCE_CLASS.RETAILER, 'Lowe’s'],
  ['costco.com', SOURCE_CLASS.RETAILER, 'Costco'], ['samsclub.com', SOURCE_CLASS.RETAILER, 'Sam’s Club'], ['abt.com', SOURCE_CLASS.RETAILER, 'Abt'],
  ['crutchfield.com', SOURCE_CLASS.RETAILER, 'Crutchfield'], ['ajmadison.com', SOURCE_CLASS.RETAILER, 'AJ Madison'], ['appliancesconnection.com', SOURCE_CLASS.RETAILER, 'Appliances Connection'],
  ['target.com', SOURCE_CLASS.RETAILER, 'Target'], ['walmart.com', SOURCE_CLASS.RETAILER, 'Walmart'],
  ['bhphotovideo.com', SOURCE_CLASS.RETAILER, 'B&H'], ['pcrichard.com', SOURCE_CLASS.RETAILER, 'P.C. Richard & Son'], ['newegg.com', SOURCE_CLASS.RETAILER, 'Newegg'],
  ['microcenter.com', SOURCE_CLASS.RETAILER, 'Micro Center'], ['electronicexpress.com', SOURCE_CLASS.RETAILER, 'Electronic Express'], ['yaleappliance.com', SOURCE_CLASS.RETAILER, 'Yale Appliance'],
  ['brandsmartusa.com', SOURCE_CLASS.RETAILER, 'BrandsMart USA'], ['bjs.com', SOURCE_CLASS.RETAILER, 'BJ’s Wholesale Club'],
  ['plessers.com', SOURCE_CLASS.RETAILER, 'Plesser’s Appliances'], ['appliancefactory.com', SOURCE_CLASS.RETAILER, 'Appliance Factory'],
  ['townappliance.com', SOURCE_CLASS.RETAILER, 'Town Appliance'], ['applianceleaders.com', SOURCE_CLASS.RETAILER, 'Appliance Leaders'],
  ['rtings.com', SOURCE_CLASS.TECH_DATABASE, 'RTINGS'], ['displayspecifications.com', SOURCE_CLASS.TECH_DATABASE, 'DisplaySpecifications'],
  ['tftcentral.co.uk', SOURCE_CLASS.TECH_DATABASE, 'TFTCentral'], ['notebookcheck.net', SOURCE_CLASS.TECH_DATABASE, 'Notebookcheck'],
  ['cnet.com', SOURCE_CLASS.REVIEW, 'CNET'], ['techradar.com', SOURCE_CLASS.REVIEW, 'TechRadar'], ['tomsguide.com', SOURCE_CLASS.REVIEW, 'Tom’s Guide'],
  ['theverge.com', SOURCE_CLASS.REVIEW, 'The Verge'], ['whathifi.com', SOURCE_CLASS.REVIEW, 'What Hi-Fi?'], ['pcmag.com', SOURCE_CLASS.REVIEW, 'PCMag'],
  ['consumerreports.org', SOURCE_CLASS.REVIEW, 'Consumer Reports'], ['reviewed.com', SOURCE_CLASS.REVIEW, 'Reviewed'], ['digitaltrends.com', SOURCE_CLASS.REVIEW, 'Digital Trends'],
  ['engadget.com', SOURCE_CLASS.REVIEW, 'Engadget'], ['zdnet.com', SOURCE_CLASS.REVIEW, 'ZDNET'], ['forbes.com', SOURCE_CLASS.REVIEW, 'Forbes'],
  ['residentialsystems.com', SOURCE_CLASS.REVIEW, 'Residential Systems'], ['theshortcut.com', SOURCE_CLASS.REVIEW, 'The Shortcut'],
  ['amazon.com', SOURCE_CLASS.MARKETPLACE, 'Amazon'], ['ebay.com', SOURCE_CLASS.MARKETPLACE, 'eBay'], ['aliexpress.com', SOURCE_CLASS.MARKETPLACE, 'AliExpress'],
  ['mercari.com', SOURCE_CLASS.MARKETPLACE, 'Mercari'], ['offerup.com', SOURCE_CLASS.MARKETPLACE, 'OfferUp'],
]);


// Only a registered domain and its own storefront hosts count. Other subdomains (marketplace, community, seller and forum hosts) can carry
// third-party content, so they are never classed as the first-party maker or retailer.
export const STOREFRONT_LABELS = Object.freeze(['shop', 'us', 'm', 'products']);
// Retailers added with Shopping listings in mind are trusted on their exact host only (with or without "www."): nothing confirms that a
// "shop.", "us.", "m." or "products." label on these domains is theirs rather than a seller's or a marketplace's.
export const EXACT_HOST_ONLY = Object.freeze(['brandsmartusa.com', 'bjs.com', 'plessers.com', 'appliancefactory.com', 'townappliance.com', 'applianceleaders.com']);
const hostMatches = (host, domain) => host === domain || (!EXACT_HOST_ONLY.includes(domain) && STOREFRONT_LABELS.some((label) => host === `${label}.${domain}`));

/** Registry entry for a host, or null: an unknown host is never a citation. */
export function classifyHost(host) {
  const clean = String(host || '').toLowerCase().replace(/^www\./, '');
  const entry = SOURCE_REGISTRY.find(([domain]) => hostMatches(clean, domain));
  return entry ? { domain: entry[0], sourceClass: entry[1], sourceName: entry[2] } : null;
}
