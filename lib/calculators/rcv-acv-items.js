// RCV/ACV Item Type dataset — annual insurance depreciation rates.
//
// Every confirmed rate/URL below was individually re-verified against the current, live
// Claims Pages depreciation calculator (https://www.claimspages.com/tools/depreciation/)
// during a 2026-08 source-integrity audit — not taken on faith from the original research
// document. That audit corrected 31 rates that had drifted from the live site and demoted
// 4 items to UNDETERMINED (3 smartphones whose Claims Pages page uses an immediate-drop +
// monthly-rate schedule incompatible with this calculator's rate × age model, and Shop
// Vacuum, whose Claims Pages source link is broken site-wide). No rate here is derived
// from useful-life studies, manufacturer lifespan data, IRS/MACRS schedules, or
// self-calculated averages.
//
// Do not add, remove, or edit rate values here without re-verifying them against the live
// Claims Pages page first. This file must not invent or infer rates.

const CLAIMS_PAGES_SOURCE_NAME = 'Claims Pages — current insurance depreciation reference';

function confirmed(group, item, annualDepreciationRate, sourceUrl) {
  return {
    id: slugify(`${group}-${item}`),
    group,
    item,
    annualDepreciationRate,
    sourceName: CLAIMS_PAGES_SOURCE_NAME,
    sourceUrl,
    sourceStatus: 'current',
    confidence: 'CONFIRMED',
  };
}

function undetermined(group, item, reason) {
  return {
    id: slugify(`${group}-${item}`),
    group,
    item,
    annualDepreciationRate: null,
    sourceName: null,
    sourceUrl: null,
    sourceStatus: null,
    confidence: 'UNDETERMINED',
    reason,
  };
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const CP = 'https://www.claimspages.com/tools/depreciation';

export const CONFIRMED_ITEMS = [
  // Kitchen Appliances
  confirmed('Kitchen Appliances', 'Refrigerator', 6.67, `${CP}/major-appliances/refrigerator/`),
  confirmed('Kitchen Appliances', 'Built-In Refrigerator', 4.44, `${CP}/major-appliances/built-in-refrigerator/`),
  confirmed('Kitchen Appliances', 'Compact / Mini Refrigerator', 12.50, `${CP}/major-appliances/compact-refrigerator/`),
  confirmed('Kitchen Appliances', 'Freezer (Chest or Upright)', 6.25, `${CP}/major-appliances/chest-upright-freezer/`),
  confirmed('Kitchen Appliances', 'Dishwasher', 10.00, `${CP}/major-appliances/dishwasher/`),
  confirmed('Kitchen Appliances', 'Gas Range / Stove', 5.56, `${CP}/major-appliances/gas-stoves-ranges/`),
  confirmed('Kitchen Appliances', 'Electric Range / Stove', 6.67, `${CP}/major-appliances/electric-stoves-ranges/`),
  confirmed('Kitchen Appliances', 'Cooktop', 7.14, `${CP}/major-appliances/cooktop/`),
  confirmed('Kitchen Appliances', 'Microwave Oven', 12.50, `${CP}/major-appliances/microwave-oven/`),
  confirmed('Kitchen Appliances', 'Built-In Microwave', 9.09, `${CP}/major-appliances/built-in-microwave-oven/`),
  confirmed('Kitchen Appliances', 'Range Hood', 7.14, `${CP}/major-appliances/range-hood/`),
  confirmed('Kitchen Appliances', 'Garbage Disposal', 9.09, `${CP}/major-appliances/garbage-disposal/`),
  confirmed('Kitchen Appliances', 'Trash Compactor', 14.29, `${CP}/major-appliances/trash-compactor/`),
  confirmed('Kitchen Appliances', 'Built-In Wine Cooler', 7.14, `${CP}/major-appliances/built-in-wine-cooler/`),

  // Laundry
  confirmed('Laundry', 'Washing Machine', 8.33, `${CP}/major-appliances/washer/`),
  confirmed('Laundry', 'Electric Dryer', 7.69, `${CP}/major-appliances/electric-dryer/`),
  confirmed('Laundry', 'Gas Dryer', 7.69, `${CP}/major-appliances/gas-dryer/`),
  confirmed('Laundry', 'Washer/Dryer Combination', 12.50, `${CP}/major-appliances/washer-dryer-combination/`),

  // HVAC / Heating & Cooling
  confirmed('HVAC / Heating & Cooling', 'Central Air Conditioner', 6.67, `${CP}/hvac-systems/central-air-conditioners/`),
  confirmed('HVAC / Heating & Cooling', 'Window Air Conditioner', 10.00, `${CP}/hvac-systems/air-conditioners-window/`),
  confirmed('HVAC / Heating & Cooling', 'Heat Pump (Air-to-Air)', 6.67, `${CP}/hvac-systems/air-to-air-heat-pump/`),
  confirmed('HVAC / Heating & Cooling', 'Furnace (Coal, Gas, or Oil)', 5.00, `${CP}/hvac-systems/coal-gas-oil-furnaces/`),
  confirmed('HVAC / Heating & Cooling', 'Boiler (Cast Iron)', 3.33, `${CP}/hvac-systems/cast-iron-boiler/`),
  confirmed('HVAC / Heating & Cooling', 'Boiler (Steel)', 4.00, `${CP}/hvac-systems/steel-boiler/`),
  confirmed('HVAC / Heating & Cooling', 'Boiler (Electric)', 6.67, `${CP}/hvac-systems/electric-boiler/`),
  confirmed('HVAC / Heating & Cooling', 'Gas / Electric Heater', 7.69, `${CP}/hvac-systems/gas-electric-heater/`),
  confirmed('HVAC / Heating & Cooling', 'Space Heater', 6.67, `${CP}/major-appliances/space-heater/`),
  confirmed('HVAC / Heating & Cooling', 'Thermostat', 2.86, `${CP}/hvac-systems/thermostat/`),
  confirmed('HVAC / Heating & Cooling', 'Ceiling Fan', 5.00, `${CP}/hvac-systems/ceiling-fans/`),
  confirmed('HVAC / Heating & Cooling', 'Exhaust Fan', 5.00, `${CP}/hvac-systems/exhaust-fans/`),
  confirmed('HVAC / Heating & Cooling', 'Attic Fan', 6.67, `${CP}/hvac-systems/attic-fans/`),

  // Water Heaters & Plumbing
  confirmed('Water Heaters & Plumbing', 'Water Heater (Electric, Gas, or Oil)', 10.00, `${CP}/major-appliances/electric-gas-oil-water-heater/`),
  confirmed('Water Heaters & Plumbing', 'Tankless Water Heater', 5.00, `${CP}/major-appliances/tankless-water-heater/`),
  confirmed('Water Heaters & Plumbing', 'Sump Pump', 10.00, `${CP}/major-appliances/sump-pumps/`),
  confirmed('Water Heaters & Plumbing', 'Water Pump', 10.00, `${CP}/major-appliances/water-pumps/`),
  confirmed('Water Heaters & Plumbing', 'Well Pump', 5.00, `${CP}/building-materials-and-fixtures/well-pump/`),
  confirmed('Water Heaters & Plumbing', 'Water Softener', 5.00, `${CP}/building-materials-and-fixtures/water-softener/`),

  // Electronics
  confirmed('Electronics', 'HDTV / Flat-Screen Television', 10.00, `${CP}/consumer-electronics/high-definition-television/`),
  confirmed('Electronics', 'Video Game Console', 10.00, `${CP}/consumer-electronics/video-game-console/`),
  confirmed('Electronics', 'Streaming Device', 33.33, `${CP}/consumer-electronics/streaming-device/`),
  confirmed('Electronics', 'E-Reader', 20.00, `${CP}/consumer-electronics/e-reader/`),
  confirmed('Electronics', 'VR Headset', 25.00, `${CP}/consumer-electronics/vr-headset/`),
  confirmed('Electronics', 'Smart Display', 25.00, `${CP}/consumer-electronics/smart-display/`),
  confirmed('Electronics', 'Stereo Receiver', 6.67, `${CP}/consumer-electronics/stereo-receivers/`),
  confirmed('Electronics', 'Stereo Speakers', 5.00, `${CP}/consumer-electronics/stereo-speakers/`),

  // Office Equipment
  confirmed('Office Equipment', 'Computer', 25.00, `${CP}/office-equipment-and-supplies/computers/`),
  confirmed('Office Equipment', 'Inkjet Printer', 20.00, `${CP}/office-equipment-and-supplies/ink-jet-printers/`),
  confirmed('Office Equipment', 'Laser Printer', 10.00, `${CP}/office-equipment-and-supplies/laser-jet-printers/`),
  confirmed('Office Equipment', 'Photocopier', 8.33, `${CP}/office-equipment-and-supplies/photocopiers/`),
  confirmed('Office Equipment', 'Ergonomic Desk Chair', 14.29, `${CP}/office-equipment-and-supplies/ergonomic-desk-chair/`),
  confirmed('Office Equipment', 'Standing Desk Converter', 20.00, `${CP}/office-equipment-and-supplies/standing-desk-converter/`),

  // Furniture
  confirmed('Furniture', 'Upholstered Furniture (Sofa, Loveseat)', 10.00, `${CP}/furniture/upholstered-furniture/`),
  confirmed('Furniture', 'Leather Furniture', 5.00, `${CP}/furniture/leather-furniture/`),
  confirmed('Furniture', 'Solid Wood Furniture', 2.00, `${CP}/furniture/solid-wood/`),
  confirmed('Furniture', 'Ordinary Wood / Chrome / Plastic', 6.67, `${CP}/furniture/chrome-plastic-ordinary-wood/`),
  confirmed('Furniture', 'Desks and Tables', 5.00, `${CP}/furniture/desks-and-tables/`),
  confirmed('Furniture', 'Bookcases', 5.00, `${CP}/furniture/bookcases/`),
  confirmed('Furniture', 'Metal Bed Frame', 2.00, `${CP}/furniture/metal-bed-frame/`),
  confirmed('Furniture', "Children's Furniture", 20.00, `${CP}/furniture/childrens/`),
  confirmed('Furniture', 'Patio Furniture (Wrought Iron)', 5.00, `${CP}/furniture/wrought-iron-lawn/`),
  confirmed('Furniture', 'Patio Furniture (Aluminum / Steel)', 20.00, `${CP}/furniture/aluminum-or-steel-lawn/`),
  confirmed('Furniture', 'Patio Furniture (Redwood)', 10.00, `${CP}/furniture/redwood-lawn/`),
  confirmed('Furniture', 'Patio Furniture (Fabric)', 33.33, `${CP}/furniture/fabric-lawn/`),

  // Bedding
  confirmed('Bedding', 'Mattress', 5.00, `${CP}/bedding-and-linens/mattresses/`),
  confirmed('Bedding', 'Box Springs', 8.33, `${CP}/bedding-and-linens/box-springs/`),

  // Small Appliances
  confirmed('Small Appliances', 'Toaster', 14.29, `${CP}/small-appliances/toaster/`),
  confirmed('Small Appliances', 'Toaster Oven', 12.50, `${CP}/small-appliances/toaster-oven/`),
  confirmed('Small Appliances', 'Coffee Maker', 10.00, `${CP}/small-appliances/coffee-maker/`),
  confirmed('Small Appliances', 'Blender / Mixer', 10.00, `${CP}/small-appliances/electric-blender-mixer/`),
  confirmed('Small Appliances', 'Food Processor', 8.33, `${CP}/small-appliances/food-processor/`),
  confirmed('Small Appliances', 'Air Purifier', 8.33, `${CP}/small-appliances/air-purifier/`),
  confirmed('Small Appliances', 'Humidifier', 11.11, `${CP}/small-appliances/humidifier/`),
  confirmed('Small Appliances', 'Slow Cooker', 14.93, `${CP}/small-appliances/slow-cooker/`),
  confirmed('Small Appliances', 'Rice Cooker', 12.50, `${CP}/small-appliances/rice-cooker/`),
  confirmed('Small Appliances', 'Electric Fan', 10.00, `${CP}/small-appliances/electric-fans/`),
  confirmed('Small Appliances', 'Home Vacuum Cleaner', 10.00, `${CP}/major-appliances/home-vacuum-cleaner/`),

  // Smart Home
  confirmed('Smart Home', 'Robot Vacuum', 25.00, `${CP}/smart-home-technology/robot-vacuum/`),
  confirmed('Smart Home', 'Security System', 8.33, `${CP}/smart-home-technology/security-system/`),
  confirmed('Smart Home', 'Smoke Alarm', 10.00, `${CP}/smart-home-technology/smoke-alarm/`),
  confirmed('Smart Home', 'Wireless Home Network', 4.00, `${CP}/smart-home-technology/wireless-home-network/`),

  // Tools & Outdoor
  confirmed('Tools & Outdoor', 'Power Tools', 5.00, `${CP}/tools-and-tool-storage/power-tools/`),
  confirmed('Tools & Outdoor', 'Manual Tools', 5.00, `${CP}/tools-and-tool-storage/manual-tools/`),
  confirmed('Tools & Outdoor', 'Chainsaw', 12.50, `${CP}/tools-and-tool-storage/chainsaw/`),
  confirmed('Tools & Outdoor', 'Power Washer', 12.50, `${CP}/tools-and-tool-storage/power-washer/`),
  confirmed('Tools & Outdoor', 'Snow Blower', 12.50, `${CP}/tools-and-tool-storage/snow-blower/`),
  confirmed('Tools & Outdoor', 'Power Mower', 20.00, `${CP}/lawn-and-garden-tools/power-mower/`),
  confirmed('Tools & Outdoor', 'Riding Mower', 14.29, `${CP}/lawn-and-garden-tools/riding-mower/`),
  confirmed('Tools & Outdoor', 'Push Mower', 10.00, `${CP}/lawn-and-garden-tools/push-mower/`),
  confirmed('Tools & Outdoor', 'BBQ Grill', 12.50, `${CP}/lawn-and-garden-tools/barbeque-grills-and-sets/`),
  confirmed('Tools & Outdoor', 'Electric Hedge Trimmer', 14.29, `${CP}/lawn-and-garden-tools/electric-hedge-clippers-and-trimmers/`),
  confirmed('Tools & Outdoor', 'Lawn Edger', 14.29, `${CP}/lawn-and-garden-tools/lawn-edgers/`),
  confirmed('Tools & Outdoor', 'Garden Tools', 10.00, `${CP}/lawn-and-garden-tools/garden-tools/`),
  confirmed('Tools & Outdoor', 'Ladder', 5.00, `${CP}/lawn-and-garden-tools/ladders/`),

  // Home Equipment
  confirmed('Home Equipment', 'Garage Door Opener', 6.67, `${CP}/home-fixtures-and-fittings/garage-door-opener/`),
  confirmed('Home Equipment', 'Gas Fireplace', 2.86, `${CP}/building-materials-and-fixtures/gas-fireplace/`),
  confirmed('Home Equipment', 'Electric Fireplace Insert', 8.33, `${CP}/furniture/electric-fireplace-insert/`),
];

export const UNDETERMINED_ITEMS = [
  undetermined('Kitchen Appliances', 'Induction Range', 'No separate Claims Pages entry.'),
  undetermined('Kitchen Appliances', 'Wall Oven', 'No separate Claims Pages entry.'),
  undetermined('Electronics', 'OLED Television', 'No separate Claims Pages entry.'),
  undetermined('Electronics', 'Tablet', 'No separate Claims Pages entry.'),
  undetermined('Electronics', 'Computer Monitor', 'No separate Claims Pages entry.'),
  undetermined('Electronics', 'Soundbar', 'No separate Claims Pages entry.'),
  undetermined('Electronics', 'Projector', 'No separate Claims Pages entry.'),
  undetermined('HVAC / Heating & Cooling', 'Mini-Split / Ductless HVAC', 'No Claims Pages entry.'),
  undetermined('Water Heaters & Plumbing', 'Heat-Pump Water Heater', 'No separate Claims Pages entry.'),
  undetermined('Tools & Outdoor', 'Generator', 'No Claims Pages entry found.'),
  undetermined('Home Equipment', 'Pool Pump', 'No Claims Pages entry found.'),
  undetermined('Home Equipment', 'Hot Tub / Spa Equipment', 'Rate not individually verified in current research.'),

  // Demoted from CONFIRMED by the 2026-08 live source-integrity audit:
  undetermined('Tools & Outdoor', 'Shop Vacuum (Wet/Dry)', 'The Claims Pages source link for this item is broken site-wide (the href on both its category page and the master item listing is malformed — "/tools-and-tool-storage/wet/dry-shop-vacuum/" — and does not resolve, returning HTTP 404). No working live page could be located, so the rate cannot be independently verified.'),
  undetermined('Electronics', 'Smartphone (Apple iPhone)', 'Claims Pages does not publish a simple annual %/year rate for this item. It uses an incompatible depreciation schedule instead ("25% immediately after purchase, then 3% per month"), which this calculator\'s rate × age model cannot represent without inventing a conversion.'),
  undetermined('Electronics', 'Smartphone (Samsung)', 'Claims Pages does not publish a simple annual %/year rate for this item. It uses an incompatible depreciation schedule instead ("30% immediately after purchase, then 4% per month"), which this calculator\'s rate × age model cannot represent without inventing a conversion.'),
  undetermined('Electronics', 'Smartphone (Google)', 'Claims Pages does not publish a simple annual %/year rate for this item. It uses an incompatible depreciation schedule instead ("30% immediately after purchase, then 4% per month"), which this calculator\'s rate × age model cannot represent without inventing a conversion.'),
];

export const OTHER_CUSTOM_ITEM = {
  id: 'other-custom',
  group: 'Other',
  item: 'Other / Custom',
  annualDepreciationRate: null,
  sourceName: null,
  sourceUrl: null,
  sourceStatus: null,
  confidence: null,
  reason: 'Enter the annual depreciation rate required by your claim or estimating methodology.',
};

export const ALL_ITEMS = [...CONFIRMED_ITEMS, ...UNDETERMINED_ITEMS, OTHER_CUSTOM_ITEM];

export function findRcvAcvItem(id) {
  return ALL_ITEMS.find((entry) => entry.id === id) || null;
}
