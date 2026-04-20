import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

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

const categoryLinks = [
  { href: '/appliances', label: 'Appliances' },
  { href: '/hvac', label: 'HVAC' },
  { href: '/electronics', label: 'Electronics' }
];

const pages = [
  {
    slug: 'goodman-serial-number-lookup',
    title: 'Goodman Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode Goodman serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Goodman Serial Number Decoder',
    badge: 'Goodman lookup',
    category: 'hvac',
    brandValue: 'goodman',
    intro: [
      'Use the Goodman serial number lookup below to estimate manufacture date and equipment age without leaving the page.',
      'This landing page is built for field inspections, replacement planning, service writeups, and resale research.'
    ],
    howTitle: 'How to Read Goodman Serial Numbers',
    howBody: [
      'Start with the full serial number from the rating plate and enter it exactly as shown, including leading zeros and letters.',
      'Goodman equipment often uses date-coded serial patterns, so the serial number is usually the fastest way to estimate production year.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Outdoor condensers usually place the data plate on the cabinet side near the refrigerant service area.',
      'Furnaces and air handlers commonly place the label inside the blower compartment, on the cabinet face, or behind the service panel.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `2419A12345` may follow a week-and-year format on some HVAC labels, where `24` is the production week and `19` is the year.',
      'Always compare the exact character positions on your label because format rules can vary by model family and production run.'
    ],
    faqs: [
      ['How do I find the age of my Goodman unit?', 'Locate the equipment data plate, copy the serial number exactly, and run it through the Goodman decoder on this page.'],
      ['Where is the Goodman serial number located?', 'Look on the condenser cabinet, furnace cabinet, air-handler panel, or other manufacturer rating plate.'],
      ['Can I use this for Goodman furnaces and AC units?', 'Yes. This page is intended for common Goodman HVAC product lines where the serial number is available.']
    ],
    relatedBrands: [
      ['carrier-serial-number-lookup', 'Carrier'],
      ['trane-serial-number-lookup', 'Trane'],
      ['rheem-serial-number-lookup', 'Rheem'],
      ['how-to-find-hvac-age', 'How to Find HVAC Age']
    ]
  },
  {
    slug: 'whirlpool-serial-number-lookup',
    title: 'Whirlpool Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode Whirlpool serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Whirlpool Serial Number Decoder',
    badge: 'Whirlpool lookup',
    category: 'appliances',
    brandValue: 'whirlpool',
    intro: [
      'Run a Whirlpool serial number lookup here to estimate manufacture date and appliance age with the same decoder used across the site.',
      'It is designed for quick refrigerator, dishwasher, washer, dryer, oven, and range age checks.'
    ],
    howTitle: 'How to Read Whirlpool Serial Numbers',
    howBody: [
      'Enter the Whirlpool serial number exactly as printed on the appliance tag, including letters, numbers, and any leading zeros.',
      'Whirlpool manufacturing codes frequently contain week and year signals that help narrow the production window.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Refrigerators usually place the label inside the fresh-food compartment, while dishwashers often place it along the door frame.',
      'Washers, dryers, ovens, and ranges typically place the plate around the door opening, rear panel, or interior frame.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `CU2401234` may use the middle number positions to signal a production week and year on Whirlpool-family appliances.',
      'Use the on-page decoder for the exact reading because Whirlpool-family formats can shift by era and product class.'
    ],
    faqs: [
      ['How do I find the age of my Whirlpool appliance?', 'Copy the serial number from the rating label and decode it on this page for the fastest estimate.'],
      ['Does this work for Whirlpool refrigerators and dishwashers?', 'Yes. The lookup is intended for common Whirlpool appliance categories where a serial label is present.'],
      ['What if I only have the model number?', 'Use Smart Lookup when the serial number is missing, damaged, or unreadable.']
    ],
    relatedBrands: [
      ['maytag-serial-number-lookup', 'Maytag'],
      ['kenmore-serial-number-lookup', 'Kenmore'],
      ['ge-serial-number-lookup', 'GE'],
      ['appliance-age-by-serial-number', 'Appliance Age Guide']
    ]
  },
  {
    slug: 'carrier-serial-number-lookup',
    title: 'Carrier Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode Carrier serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Carrier Serial Number Decoder',
    badge: 'Carrier lookup',
    category: 'hvac',
    brandValue: 'carrier',
    intro: [
      'Use this Carrier serial number lookup page to estimate HVAC manufacture date and age from the rating plate.',
      'It is built for inspectors, contractors, property managers, and homeowners who need a fast serial-based answer.'
    ],
    howTitle: 'How to Read Carrier Serial Numbers',
    howBody: [
      'Carrier serial lookups start with the exact label text, so copy the full serial number without guessing or trimming characters.',
      'Many Carrier-family systems encode production timing in a short character sequence that can be decoded once the format is identified.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Outdoor condensers and heat pumps usually place the serial label on the cabinet exterior near the service side.',
      'Furnaces and air handlers commonly place the plate inside the burner compartment, blower area, or cabinet face.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `2419E12345` may represent week 24 of 2019 on a week-year style HVAC serial format.',
      'The decoder on this page is the fastest way to check the exact result because Carrier-adjacent brands can reuse similar but not identical formats.'
    ],
    faqs: [
      ['How do I check the age of a Carrier unit?', 'Find the rating plate, enter the full serial number, and review the date estimate returned by the decoder.'],
      ['Can I use this for Carrier furnaces and condensers?', 'Yes. This page is intended for common Carrier HVAC equipment categories.'],
      ['What if the data plate is faded?', 'Use Smart Lookup as a fallback if the serial number is incomplete or unreadable.']
    ],
    relatedBrands: [
      ['goodman-serial-number-lookup', 'Goodman'],
      ['trane-serial-number-lookup', 'Trane'],
      ['rheem-serial-number-lookup', 'Rheem'],
      ['how-to-find-hvac-age', 'How to Find HVAC Age']
    ]
  },
  {
    slug: 'kenmore-serial-number-lookup',
    title: 'Kenmore Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode Kenmore serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Kenmore Serial Number Decoder',
    badge: 'Kenmore lookup',
    category: 'appliances',
    brandValue: 'kenmore',
    intro: [
      'This Kenmore serial number lookup page helps you estimate appliance manufacture date and age from the product tag.',
      'It is useful when you need a quick age check for service intake, replacement planning, or used-appliance research.'
    ],
    howTitle: 'How to Read Kenmore Serial Numbers',
    howBody: [
      'Enter the full Kenmore serial number exactly as shown on the label and avoid dropping prefix letters or leading zeros.',
      'Because Kenmore products were manufactured by multiple OEMs, the serial format can vary by platform and era.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Most Kenmore refrigerators place the tag inside the cabinet, while dishwashers place it on the inner frame and washers or dryers place it around the opening.',
      'Cooking products usually mount the label behind the door, drawer, or back panel.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `CM2405678` may point to a Whirlpool-family or GE-family production format depending on the source manufacturer.',
      'Run the decoder instead of guessing the OEM because Kenmore serial interpretation depends on who built the unit.'
    ],
    faqs: [
      ['How do I tell how old my Kenmore appliance is?', 'Use the serial number rather than the model number when it is available, because that is usually where age signals are stored.'],
      ['Why do Kenmore serial numbers vary so much?', 'Kenmore branding spans multiple manufacturers, so the format depends on the actual production source.'],
      ['Can I still use this page if I do not know the OEM?', 'Yes. The decoder is the right starting point when the label only shows the Kenmore brand.']
    ],
    relatedBrands: [
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['ge-serial-number-lookup', 'GE'],
      ['frigidaire-serial-number-lookup', 'Frigidaire'],
      ['appliance-age-by-serial-number', 'Appliance Age Guide']
    ]
  },
  {
    slug: 'ge-serial-number-lookup',
    title: 'GE Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode GE serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'GE Serial Number Decoder',
    badge: 'GE lookup',
    category: 'appliances',
    brandValue: 'ge',
    intro: [
      'Use the GE serial number lookup below to estimate appliance age and manufacture date directly from the rating label.',
      'This page is designed for fast refrigerator, range, dishwasher, laundry, and built-in appliance lookups.'
    ],
    howTitle: 'How to Read GE Serial Numbers',
    howBody: [
      'GE serial number lookups work best when you enter the full code exactly as shown, including the leading letters.',
      'Many GE-family serial formats use letter positions to signal month and year, which makes the serial number more useful than the model number for age checks.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Refrigerators commonly place the label inside the fresh-food section, while ranges, ovens, and dishwashers place it around the door frame or trim.',
      'Washers and dryers usually mount the data plate inside the lid area, around the opening, or on the rear cabinet.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `AZ123456G` may use the leading letters as part of a month-year code on a GE-family format.',
      'Use the decoder result instead of reading by eye when the unit could overlap multiple decade cycles.'
    ],
    faqs: [
      ['How do I find the manufacture date on a GE appliance?', 'Copy the serial number from the rating plate and decode it on this page.'],
      ['Does this work for GE refrigerators, ovens, and washers?', 'Yes. The page is intended for common GE appliance categories with a visible serial label.'],
      ['What if my label is damaged?', 'Use Smart Lookup if the serial number is incomplete or unreadable.']
    ],
    relatedBrands: [
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['lg-serial-number-lookup', 'LG'],
      ['kenmore-serial-number-lookup', 'Kenmore'],
      ['appliance-age-by-serial-number', 'Appliance Age Guide']
    ]
  },
  {
    slug: 'lg-serial-number-lookup',
    title: 'LG Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode LG serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'LG Serial Number Decoder',
    badge: 'LG lookup',
    category: 'appliances',
    brandValue: 'lg',
    intro: [
      'Use this LG serial number lookup to estimate manufacture date and age from the label on your appliance.',
      'It is built for quick service intake and replacement research across refrigerators, laundry, dishwashers, and kitchen products.'
    ],
    howTitle: 'How to Read LG Serial Numbers',
    howBody: [
      'Enter the complete LG serial number exactly as shown on the data tag, including the leading number and month digits.',
      'LG serial formats often expose year and month cues early in the string, which is why the serial number is the strongest age signal.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'LG refrigerators usually place the tag inside the cabinet, while washers, dryers, and dishwashers place it around the door opening or frame.',
      'Ranges and ovens commonly place the serial label behind the door, storage drawer, or rear trim area.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `312KWAB12345` may use the first digit for year and the next two digits for month on an LG-style appliance format.',
      'Use the tool for the final reading because some LG product groups and regions can present different serial layouts.'
    ],
    faqs: [
      ['How do I check the age of an LG appliance?', 'Locate the product label, copy the serial number exactly, and run it through the decoder on this page.'],
      ['Can this page help with LG kitchen and laundry appliances?', 'Yes. It is intended for common LG appliance categories where the serial tag is available.'],
      ['What about LG TVs or monitors?', 'Use Smart Lookup for electronics research if your product does not match the appliance-focused decoder path.']
    ],
    relatedBrands: [
      ['ge-serial-number-lookup', 'GE'],
      ['samsung-serial-number-lookup', 'Samsung'],
      ['frigidaire-serial-number-lookup', 'Frigidaire'],
      ['how-to-read-serial-number', 'How to Read a Serial Number']
    ]
  },
  {
    slug: 'frigidaire-serial-number-lookup',
    title: 'Frigidaire Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode Frigidaire serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Frigidaire Serial Number Decoder',
    badge: 'Frigidaire lookup',
    category: 'appliances',
    brandValue: 'frigidaire',
    intro: [
      'Run a Frigidaire serial number lookup here when you need a quick manufacture date or appliance age estimate.',
      'This page supports common field and resale questions for refrigerators, dishwashers, ranges, washers, and dryers.'
    ],
    howTitle: 'How to Read Frigidaire Serial Numbers',
    howBody: [
      'Enter the entire serial number from the rating tag exactly as printed so the decoder can match the right format.',
      'Frigidaire-family appliance labels often use production codes that can point to the likely manufacturing period.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'On refrigerators, check the inside cabinet walls. On dishwashers, check the inner door frame. On laundry products, check around the opening or rear panel.',
      'Ranges and ovens usually place the serial tag behind the door, on the frame, or behind the lower drawer.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `VF24012345` may indicate a production sequence where the letter prefix and early digits narrow the manufacturing window.',
      'Use the live decoder to confirm the result because Electrolux-family and Frigidaire-family labels can overlap similar-looking serial structures.'
    ],
    faqs: [
      ['How do I find the age of a Frigidaire appliance?', 'Use the serial number from the rating label and decode it on this page.'],
      ['Does this work for Frigidaire refrigerators and dishwashers?', 'Yes. The page is intended for the main appliance categories that use Frigidaire serial labels.'],
      ['What if the serial number is missing?', 'Use Smart Lookup as a fallback when the serial tag is damaged or unavailable.']
    ],
    relatedBrands: [
      ['ge-serial-number-lookup', 'GE'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['kenmore-serial-number-lookup', 'Kenmore'],
      ['appliance-age-by-serial-number', 'Appliance Age Guide']
    ]
  },
  {
    slug: 'maytag-serial-number-lookup',
    title: 'Maytag Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode Maytag serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Maytag Serial Number Decoder',
    badge: 'Maytag lookup',
    category: 'appliances',
    brandValue: 'maytag',
    intro: [
      'Use this Maytag serial number lookup to estimate appliance manufacture date and age from the rating label.',
      'It is built for fast checks on washers, dryers, refrigerators, dishwashers, and cooking appliances.'
    ],
    howTitle: 'How to Read Maytag Serial Numbers',
    howBody: [
      'Enter the serial number exactly as shown so the decoder can account for Maytag serial patterns and era overlap.',
      'Maytag-family products can reuse formats across decades, which is why serial-based age checks need the exact string.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Washers and dryers usually place the label around the door opening or cabinet edge, while refrigerators place it inside the fresh-food section.',
      'Dishwashers and ranges typically place the data plate on the frame, trim, or interior door area.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `12345678AB` may require an era-aware decoder path because some Maytag-family formats overlap multiple production periods.',
      'Use the manufacture-era option when prompted so the result matches the correct decoding logic.'
    ],
    faqs: [
      ['How do I find the age of my Maytag appliance?', 'Copy the serial number from the label and decode it on this page for the fastest estimate.'],
      ['Why does the page ask about manufacture era?', 'Some Maytag-family serial formats repeat, so era context helps avoid the wrong decade.'],
      ['Can I use this for laundry and kitchen appliances?', 'Yes. The page is intended for common Maytag appliance categories with a visible serial tag.']
    ],
    relatedBrands: [
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['kenmore-serial-number-lookup', 'Kenmore'],
      ['ge-serial-number-lookup', 'GE'],
      ['how-to-read-serial-number', 'How to Read a Serial Number']
    ]
  },
  {
    slug: 'rheem-serial-number-lookup',
    title: 'Rheem Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode Rheem serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Rheem Serial Number Decoder',
    badge: 'Rheem lookup',
    category: 'hvac',
    brandValue: 'rheem',
    intro: [
      'Use this Rheem serial number lookup to estimate manufacture date and equipment age from the unit label.',
      'It is suited for HVAC age checks where fast serial-based dating matters during inspections, repairs, and replacement decisions.'
    ],
    howTitle: 'How to Read Rheem Serial Numbers',
    howBody: [
      'Copy the full Rheem serial number exactly as shown on the rating plate before running the decoder.',
      'Rheem serial formats can encode manufacture timing in early character positions, making the serial number the best starting point for age lookup.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Outdoor HVAC equipment usually places the label on the cabinet exterior, while furnaces and indoor units often place it inside or near the access panel.',
      'If you are researching a different Rheem product family and the HVAC label pattern does not fit, switch to Smart Lookup for broader guidance.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `W241912345` may use week and year positions to point to a likely production window on a Rheem-family HVAC label.',
      'Always confirm against the live decode result because model family and product class can change the serial interpretation.'
    ],
    faqs: [
      ['How do I tell how old a Rheem unit is?', 'Locate the data plate, copy the serial number, and decode it on this page.'],
      ['Does this page work for Rheem HVAC equipment?', 'Yes. The default decoder path on this page is optimized for HVAC age lookup.'],
      ['What if I need a broader product search?', 'Use Smart Lookup if the serial number is damaged or the product category is unclear.']
    ],
    relatedBrands: [
      ['carrier-serial-number-lookup', 'Carrier'],
      ['trane-serial-number-lookup', 'Trane'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['how-to-find-hvac-age', 'How to Find HVAC Age']
    ]
  },
  {
    slug: 'trane-serial-number-lookup',
    title: 'Trane Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode Trane serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Trane Serial Number Decoder',
    badge: 'Trane lookup',
    category: 'hvac',
    brandValue: 'trane',
    intro: [
      'Use this Trane serial number lookup to estimate HVAC manufacture date and system age from the unit plate.',
      'It is built for contractors, inspectors, and owners who need a direct serial-based answer.'
    ],
    howTitle: 'How to Read Trane Serial Numbers',
    howBody: [
      'Start with the exact serial number from the Trane rating plate and enter it without removing letters or leading digits.',
      'Trane-family serial formats often carry date information, but the exact character positions can vary by era.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'On outdoor equipment, check the exterior cabinet panel. On furnaces and air handlers, check the service panel area or cabinet face.',
      'If the unit is hard to access, photograph the data plate first so the serial can be entered accurately.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `2419X12345` may indicate week 24 of 2019 on a week-year style serial layout.',
      'The decoder is the best way to confirm the interpretation because Trane-family equipment can span multiple production schemes.'
    ],
    faqs: [
      ['How do I check the age of a Trane unit?', 'Use the serial number from the rating plate and decode it on this page.'],
      ['Does this work for Trane condensers and furnaces?', 'Yes. This page is intended for common Trane HVAC product categories.'],
      ['What if my serial number does not fit the expected pattern?', 'Use Smart Lookup for fallback research when the serial is incomplete, unclear, or outside the main supported formats.']
    ],
    relatedBrands: [
      ['carrier-serial-number-lookup', 'Carrier'],
      ['rheem-serial-number-lookup', 'Rheem'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['hvac-age-by-serial-number', 'HVAC Age Guide']
    ]
  },
  {
    slug: 'samsung-serial-number-lookup',
    title: 'Samsung Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode Samsung serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Samsung Serial Number Decoder',
    badge: 'Samsung lookup',
    category: 'appliances',
    brandValue: 'samsung',
    intro: [
      'Use this Samsung serial number lookup page to estimate manufacture date and appliance age from the product label.',
      'It is built for quick serial-based checks across refrigerators, laundry, dishwashers, and kitchen appliances.'
    ],
    howTitle: 'How to Read Samsung Serial Numbers',
    howBody: [
      'Enter the full Samsung serial number exactly as shown on the rating tag, including all letters and digits.',
      'Samsung appliance serial formats often contain a year signal within the early character positions, which is why the serial number is the preferred age input.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Refrigerators commonly place the label inside the cabinet, while laundry appliances and dishwashers place it around the opening or frame.',
      'Ranges and ovens usually place the product label behind the door, drawer, or trim area.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `0ABCD123456` may contain the year marker in an early letter position on a Samsung appliance format.',
      'Use the decoder to verify the result because Samsung electronics and appliance serial systems are not the same.'
    ],
    faqs: [
      ['How do I find the age of a Samsung appliance?', 'Locate the serial number on the product tag and decode it on this page.'],
      ['Does this page focus on Samsung appliances or electronics?', 'The default decoder path is appliance-focused. Use Smart Lookup for TVs, monitors, or phones.'],
      ['What if I only have a partial serial number?', 'Use Smart Lookup if the label is damaged or incomplete.']
    ],
    relatedBrands: [
      ['lg-serial-number-lookup', 'LG'],
      ['ge-serial-number-lookup', 'GE'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['how-to-read-serial-number', 'How to Read a Serial Number']
    ]
  },
  {
    slug: 'refrigerator-serial-number-lookup',
    title: 'Refrigerator Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode refrigerator serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Refrigerator Serial Number Decoder',
    badge: 'Refrigerator lookup',
    category: 'appliances',
    brandValue: '',
    intro: [
      'Use this refrigerator serial number lookup to estimate manufacture date and age when you have the product label but not the original paperwork.',
      'The decoder supports a broad appliance workflow, then Smart Lookup covers damaged tags and model-only searches.'
    ],
    howTitle: 'How to Read Refrigerator Serial Numbers',
    howBody: [
      'Choose the refrigerator brand in the decoder, then enter the serial number exactly as printed on the label.',
      'Most refrigerator age checks depend on serial patterns rather than model numbers because the date clues are usually embedded in the serial.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Most refrigerators place the label inside the fresh-food compartment on the side wall, ceiling, or behind the crisper area.',
      'If it is not visible inside, check the frame behind the lower drawer, rear panel, or manufacturer service tag.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `AZ123456` or `312KWAB12345` can point to different year-month decoding rules depending on the brand.',
      'Always select the correct brand before decoding because refrigerator serial formats are manufacturer-specific.'
    ],
    faqs: [
      ['How do I find the age of my refrigerator?', 'Find the brand label inside the cabinet, select the brand in the decoder, and enter the serial number exactly as shown.'],
      ['Can I use this for side-by-side and French-door refrigerators?', 'Yes. The workflow is intended for common refrigerator styles as long as the product label is available.'],
      ['What if the label is missing?', 'Use Smart Lookup if you only have the model number or a partial product description.']
    ],
    relatedBrands: [
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['ge-serial-number-lookup', 'GE'],
      ['lg-serial-number-lookup', 'LG'],
      ['frigidaire-serial-number-lookup', 'Frigidaire']
    ]
  },
  {
    slug: 'washer-serial-number-lookup',
    title: 'Washer Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode washer serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Washer Serial Number Decoder',
    badge: 'Washer lookup',
    category: 'appliances',
    brandValue: '',
    intro: [
      'Use this washer serial number lookup to estimate manufacture date and machine age from the rating tag.',
      'It is built for quick laundry appliance checks during repairs, replacement quotes, and used-item research.'
    ],
    howTitle: 'How to Read Washer Serial Numbers',
    howBody: [
      'Select the correct brand first, then enter the washer serial number exactly as shown on the label.',
      'The serial number is the strongest age signal because most washer model numbers do not directly encode manufacture date.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Top-load washers often place the label under the lid or on the rear panel, while front-load washers usually place it around the door opening.',
      'If needed, check the back of the cabinet or the edge of the door frame.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `CU2401234` or `AZ123456` can be decoded only after the correct washer brand is selected.',
      'Different manufacturers reuse similar letter and number shapes, so brand context matters before reading the date code.'
    ],
    faqs: [
      ['How do I tell how old my washer is?', 'Find the serial label, choose the brand in the decoder, and run the serial number through the tool on this page.'],
      ['Does this page work for top-load and front-load washers?', 'Yes. The process is the same as long as the serial label is available.'],
      ['What if the serial tag is worn off?', 'Use Smart Lookup when the serial is unreadable and you only have the model information.']
    ],
    relatedBrands: [
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['maytag-serial-number-lookup', 'Maytag'],
      ['samsung-serial-number-lookup', 'Samsung'],
      ['kenmore-serial-number-lookup', 'Kenmore']
    ]
  },
  {
    slug: 'dryer-serial-number-lookup',
    title: 'Dryer Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode dryer serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Dryer Serial Number Decoder',
    badge: 'Dryer lookup',
    category: 'appliances',
    brandValue: '',
    intro: [
      'Use this dryer serial number lookup to estimate production date and appliance age from the data label.',
      'It is intended for quick laundry equipment checks when service history is unavailable.'
    ],
    howTitle: 'How to Read Dryer Serial Numbers',
    howBody: [
      'Pick the dryer brand in the decoder, then enter the full serial number from the product tag without editing it.',
      'The decoder is more reliable than a manual guess because dryer serial formats vary widely by manufacturer.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Most dryers place the label around the door opening, on the rear panel, or just inside the door frame.',
      'If the tag is not obvious, check the cabinet edge or service area with a flashlight.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `2419A12345` could mean very different things on different dryer brands, even if the character count matches.',
      'Always select the manufacturer before decoding so the date logic matches the right platform.'
    ],
    faqs: [
      ['How do I find the age of my dryer?', 'Use the serial number from the product tag and decode it on this page after selecting the correct brand.'],
      ['Can I use this for gas and electric dryers?', 'Yes. The workflow is based on the manufacturer serial label, not the dryer fuel type.'],
      ['What if I only know the model number?', 'Use Smart Lookup for model-based research when the serial tag is missing.']
    ],
    relatedBrands: [
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['maytag-serial-number-lookup', 'Maytag'],
      ['ge-serial-number-lookup', 'GE'],
      ['lg-serial-number-lookup', 'LG']
    ]
  },
  {
    slug: 'dishwasher-serial-number-lookup',
    title: 'Dishwasher Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode dishwasher serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Dishwasher Serial Number Decoder',
    badge: 'Dishwasher lookup',
    category: 'appliances',
    brandValue: '',
    intro: [
      'Use this dishwasher serial number lookup to estimate manufacture date and appliance age directly from the door-frame label.',
      'It is built for service teams, sellers, buyers, and owners who need a fast age check.'
    ],
    howTitle: 'How to Read Dishwasher Serial Numbers',
    howBody: [
      'Select the dishwasher brand in the decoder and enter the full serial number exactly as it appears on the label.',
      'Serial-based dating is usually more useful than model-based research because the age code is typically stored in the serial.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Most dishwashers place the serial and model tag on the inner door frame or tub edge when the door is open.',
      'If it is not there, inspect the side trim area or manufacturer plate near the hinge frame.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `VF24012345` or `CU2401234` can be decoded only after the correct brand family is selected.',
      'Dishwasher serial formats are brand-specific, so use the live decoder instead of applying a generic pattern.'
    ],
    faqs: [
      ['How do I find the age of my dishwasher?', 'Open the door, locate the label on the frame, and decode the serial number on this page.'],
      ['Does this work for built-in and drawer dishwashers?', 'Yes. The process is the same if the product label is present.'],
      ['What if my label is unreadable?', 'Use Smart Lookup when the serial is incomplete or the product tag is damaged.']
    ],
    relatedBrands: [
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['ge-serial-number-lookup', 'GE'],
      ['bosch', 'Bosch Brand Page'],
      ['frigidaire-serial-number-lookup', 'Frigidaire']
    ]
  },
  {
    slug: 'oven-serial-number-lookup',
    title: 'Oven Serial Number Lookup (Find Manufacture Date Instantly)',
    description: 'Decode oven serial numbers to find manufacture date and age instantly. Free tool built for professionals.',
    h1: 'Oven Serial Number Decoder',
    badge: 'Oven lookup',
    category: 'appliances',
    brandValue: '',
    intro: [
      'Use this oven serial number lookup to estimate manufacture date and appliance age from the product label.',
      'It is intended for built-in ovens, ranges, wall ovens, and similar cooking products.'
    ],
    howTitle: 'How to Read Oven Serial Numbers',
    howBody: [
      'Select the oven brand in the decoder, then enter the complete serial number exactly as printed on the label.',
      'The serial number is usually the fastest way to estimate appliance age because the model number does not always carry date information.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Most ovens and ranges place the label behind the oven door, on the front frame, under the cooktop, or behind the lower drawer.',
      'Wall ovens may place the tag on the trim edge or interior frame visible when the door is open.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `AZ123456` or `312KWAB12345` may decode differently depending on the oven manufacturer and production family.',
      'Choose the correct brand first so the decoder applies the right serial rules.'
    ],
    faqs: [
      ['How do I find the age of my oven?', 'Locate the label around the door or frame and decode the serial number on this page.'],
      ['Can I use this for ranges and wall ovens?', 'Yes. The workflow is intended for the main residential cooking product categories.'],
      ['What if I only have a model number?', 'Use Smart Lookup when the serial is missing or inaccessible.']
    ],
    relatedBrands: [
      ['ge-serial-number-lookup', 'GE'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['frigidaire-serial-number-lookup', 'Frigidaire'],
      ['lg-serial-number-lookup', 'LG']
    ]
  },
  {
    slug: 'how-to-find-hvac-age',
    title: 'How to Find HVAC Age by Serial Number',
    description: 'Learn how to find HVAC age by serial number using brand-specific decoder logic and a free lookup tool.',
    h1: 'How to Find HVAC Age',
    badge: 'HVAC age guide',
    category: 'hvac',
    brandValue: '',
    intro: [
      'Use this HVAC age guide when you need to estimate system manufacture date from the serial number on the equipment label.',
      'The decoder below handles the serial-based step, while the short reference notes help you find the right plate and choose the correct brand.'
    ],
    howTitle: 'How to Read HVAC Serial Numbers',
    howBody: [
      'Start by identifying the HVAC brand, then enter the full serial number exactly as shown on the rating plate.',
      'Serial formats vary by manufacturer, so week-year and month-year patterns should only be interpreted after the brand is selected.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Outdoor condensers and heat pumps usually place the rating label on the cabinet exterior, while furnaces and air handlers place it on or inside the service panel area.',
      'Photograph the label before typing the serial number so letters and zeros are not misread.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `2419A12345` may represent week 24 of 2019 on one brand, while another brand may use those same positions differently.',
      'That is why the safest workflow is brand selection first, decode second.'
    ],
    faqs: [
      ['What is the fastest way to find HVAC age?', 'Use the unit serial number from the rating plate and decode it with the correct brand selected.'],
      ['Can I estimate age without the serial number?', 'Sometimes, but Smart Lookup is the better fallback when the plate is unreadable or incomplete.'],
      ['Does the model number show HVAC age?', 'Usually not as clearly as the serial number. The serial label is typically the better source for manufacture timing.']
    ],
    relatedBrands: [
      ['carrier-serial-number-lookup', 'Carrier'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['trane-serial-number-lookup', 'Trane'],
      ['rheem-serial-number-lookup', 'Rheem']
    ]
  },
  {
    slug: 'how-to-read-serial-number',
    title: 'How to Read a Serial Number for Appliance and HVAC Age',
    description: 'Learn how to read serial numbers for appliance and HVAC age checks with a free decoder and practical label guidance.',
    h1: 'How to Read a Serial Number',
    badge: 'Serial number guide',
    category: 'appliances',
    brandValue: '',
    intro: [
      'Use this guide when you have a serial number and need to turn it into a manufacture date or estimated age.',
      'The decoder below handles the brand-specific logic, while the sections on this page explain the workflow and common label locations.'
    ],
    howTitle: 'How to Read Serial Numbers',
    howBody: [
      'Choose the product brand first, then enter the full serial number exactly as shown on the label without skipping letters or zeros.',
      'Serial number age checks only work when the brand and full code are correct, because each manufacturer uses its own date layout.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Appliance labels are usually inside the door frame, cabinet, or product opening, while HVAC labels are typically on the exterior cabinet or service panel area.',
      'If the plate is dirty or faded, take a photo and zoom in before entering the code.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `AZ123456` may decode from leading letters on one brand, while `312KWAB12345` may use early digits for year and month on another.',
      'The correct reading depends on the brand, which is why manual guesswork often creates the wrong decade or month.'
    ],
    faqs: [
      ['Can I read any serial number the same way?', 'No. Serial formats are manufacturer-specific, so the brand must be identified before decoding.'],
      ['Why does the decoder ask for the full serial number?', 'Missing letters, zeros, or suffix characters can change the date result.'],
      ['What if I cannot identify the brand?', 'Use Smart Lookup first, then return to serial decoding once the product line is clearer.']
    ],
    relatedBrands: [
      ['ge-serial-number-lookup', 'GE'],
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['carrier-serial-number-lookup', 'Carrier'],
      ['goodman-serial-number-lookup', 'Goodman']
    ]
  },
  {
    slug: 'appliance-age-by-serial-number',
    title: 'Appliance Age by Serial Number',
    description: 'Find appliance age by serial number with a free decoder for major brands and a concise label guide.',
    h1: 'Appliance Age by Serial Number',
    badge: 'Appliance age guide',
    category: 'appliances',
    brandValue: '',
    intro: [
      'Use this appliance age guide when you need a fast manufacture date estimate from the serial number on the rating label.',
      'The decoder below is the main tool, and the short sections on this page cover the label workflow and common lookup patterns.'
    ],
    howTitle: 'How to Read Appliance Serial Numbers',
    howBody: [
      'Select the appliance brand first, then enter the full serial number exactly as shown on the product tag.',
      'Most appliance manufacturers store age clues in the serial number rather than the model number, so the serial is the primary input.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Refrigerators usually place the label inside the cabinet, dishwashers on the door frame, washers and dryers around the opening, and ovens on the frame or trim.',
      'If the tag is hard to read, use a flashlight or a phone camera before entering the serial.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `CU2401234`, `AZ123456`, and `312KWAB12345` can all signal age differently depending on the appliance brand.',
      'The safest workflow is to identify the brand, then let the decoder apply the matching serial rules.'
    ],
    faqs: [
      ['How do I find appliance age by serial number?', 'Use the serial number from the product label and decode it with the correct brand selected.'],
      ['Is the serial number better than the model number for age checks?', 'Usually yes. The serial number is more likely to contain manufacture timing.'],
      ['What if the appliance label is missing?', 'Use Smart Lookup when you only have the model number, a product description, or photos.']
    ],
    relatedBrands: [
      ['whirlpool-serial-number-lookup', 'Whirlpool'],
      ['ge-serial-number-lookup', 'GE'],
      ['lg-serial-number-lookup', 'LG'],
      ['frigidaire-serial-number-lookup', 'Frigidaire']
    ]
  },
  {
    slug: 'hvac-age-by-serial-number',
    title: 'HVAC Age by Serial Number',
    description: 'Find HVAC age by serial number with a free decoder for major equipment brands and concise plate-location guidance.',
    h1: 'HVAC Age by Serial Number',
    badge: 'HVAC age lookup',
    category: 'hvac',
    brandValue: '',
    intro: [
      'Use this HVAC age by serial number page when you need a quick manufacture date estimate from the equipment rating plate.',
      'The decoder below handles the brand-specific date logic for common residential HVAC platforms.'
    ],
    howTitle: 'How to Read HVAC Serial Numbers',
    howBody: [
      'Identify the HVAC brand first, then enter the entire serial number exactly as shown on the data plate.',
      'The age result depends on brand-specific formatting, so the same character pattern can mean different dates on different equipment.'
    ],
    whereTitle: 'Where to Find the Serial Number',
    whereBody: [
      'Outdoor units usually place the data plate on the cabinet exterior. Furnaces and indoor units usually place it on or behind the service panel area.',
      'Take a clear photo of the plate before typing the serial so letters and zeros are not confused.'
    ],
    exampleTitle: 'Example Serial Number Breakdown',
    exampleBody: [
      'Example: `2419A12345` may indicate week 24 of 2019 on one HVAC brand, but not on another.',
      'That is why brand selection and a live decode are the safest way to estimate HVAC age.'
    ],
    faqs: [
      ['How do I tell how old my HVAC system is?', 'Use the serial number from the rating plate and decode it with the correct brand selected.'],
      ['Can I do HVAC age lookup without the plate?', 'Smart Lookup can help with fallback research, but the rating plate serial is the strongest source.'],
      ['Does this help with condensers, furnaces, and air handlers?', 'Yes. The workflow is intended for the main residential HVAC equipment categories.']
    ],
    relatedBrands: [
      ['carrier-serial-number-lookup', 'Carrier'],
      ['goodman-serial-number-lookup', 'Goodman'],
      ['trane-serial-number-lookup', 'Trane'],
      ['rheem-serial-number-lookup', 'Rheem']
    ]
  }
];

function renderFaqSchema(faqs) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer }
    }))
  });
}

function renderFaqHtml(faqs) {
  return faqs.map(([question, answer]) => `
          <div class="faq-item">
            <h3>${question}</h3>
            <p>${answer}</p>
          </div>`).join('');
}

function renderLinks(links) {
  return links.map(([slug, label]) => `<a href="/${slug}">${label}</a>`).join('');
}

function renderPage(page) {
  const canonical = `https://www.decodemyitem.com/${page.slug}`;
  const categoryLinkHtml = categoryLinks.map((item) => `<a href="${item.href}">${item.label}</a>`).join('');
  const brandScript = page.brandValue
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
  <title>${page.title}</title>
  <meta name="description" content="${page.description}">
  <link rel="canonical" href="${canonical}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <meta property="og:locale" content="en_US">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Decode My Item">
  <meta property="og:title" content="${page.title}">
  <meta property="og:description" content="${page.description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="https://www.decodemyitem.com/assets/item-assist-banner.png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${page.title}">
  <meta name="twitter:description" content="${page.description}">
  <meta name="twitter:image" content="https://www.decodemyitem.com/assets/item-assist-banner.png">
  <link rel="stylesheet" href="shared.css">
  <link rel="stylesheet" href="seo-landing.css">
  <link rel="icon" type="image/png" href="favicon.png">
</head>
<body data-page-kind="brand-page">
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
    <section class="page-hero seo-hero">
      <div class="tool-hero">
        <div class="tool-badge">${page.badge}</div>
        <h1>${page.h1}</h1>
        <p>${page.intro[0]} ${page.intro[1]}</p>
        <div class="how-steps">
          <div class="how-step"><span class="how-step-num">1</span> Select the right category</div>
          <div class="how-step"><span class="how-step-num">2</span> Enter the serial number exactly</div>
          <div class="how-step"><span class="how-step-num">3</span> Decode for an instant date estimate</div>
        </div>
      </div>
    </section>

    <section class="section seo-copy-section">
      <div class="seo-copy-wrap">
        <p>${page.intro[0]}</p>
        <p>${page.intro[1]}</p>
        <div class="inline-link-row">
          <a href="/smart-lookup">Smart Lookup</a>
          ${categoryLinkHtml}
        </div>
      </div>
    </section>

    <section class="section" id="decoder-tool" style="padding-top:0;padding-bottom:16px;">
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
                      <select id="brand" class="search-select">
                        <option value="">-- Select Brand --</option>
                      </select>

                      <label class="sr-only serial-label" for="serial">Enter Serial Number</label>
                      <input type="text" id="serial" class="search-input" placeholder="Enter serial number">
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

                    <p class="search-hint serial-helper-text">Enter the serial number exactly as shown on the product label.</p>
                    <div class="tool-panel-action">
                      <button id="decodeBtn" class="btn-primary power-btn" type="button" disabled onclick="decodeSerial()">Decode Serial Number</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p class="tool-crosslink">Need a fallback path? <a href="/smart-lookup">Use Smart Lookup</a> for model-only or damaged-label research.</p>
      </div>
    </section>

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
                We use manufacturer serial format rules and published industry references to estimate manufacture date information from serial numbers.
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

    <section class="section seo-section-grid">
      <div class="seo-card">
        <h2>${page.howTitle}</h2>
        <p>${page.howBody[0]}</p>
        <p>${page.howBody[1]}</p>
      </div>
      <div class="seo-card">
        <h2>${page.whereTitle}</h2>
        <p>${page.whereBody[0]}</p>
        <p>${page.whereBody[1]}</p>
      </div>
      <div class="seo-card">
        <h2>${page.exampleTitle}</h2>
        <p>${page.exampleBody[0]}</p>
        <p>${page.exampleBody[1]}</p>
      </div>
      <div class="seo-card faq-card">
        <h2>FAQ</h2>
        <div class="faq-list">${renderFaqHtml(page.faqs)}
        </div>
      </div>
    </section>

    <section class="section related-section">
      <div class="seo-copy-wrap">
        <h2>Related Brands</h2>
        <div class="related-brands">
          ${renderLinks(page.relatedBrands)}
        </div>
        <div class="inline-link-row">
          <a href="/smart-lookup">Smart Lookup</a>
          ${categoryLinkHtml}
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

  <footer>
    <div>&copy; 2026 Decode My Item</div>
    <div class="footer-links">
      <a href="/methodology">Methodology</a>
      <a href="/contact">Contact</a>
      <a href="/security">Security &amp; Data Notice</a>
      <a href="/privacy-policy">Privacy Policy</a>
    </div>
  </footer>

  <script>
    function selectCatAndShowDecoder(cat, btn) {
      if (typeof selectCategory === 'function') selectCategory(cat, btn);
    }

    function applySeoBrandSelection(attempt) {${brandScript}
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
  <script src="lkq-engine.js"></script>
  <script src="analytics.js"></script>
  <script src="smart-lookup-extras.js"></script>
  <script src="smart-lookup-normalizer.js"></script>
  <script src="smart-lookup-summary-render.js"></script>
  <script src="script.js"></script>
  <script src="smart-lookup.js"></script>
  <script src="smart-lookup-upgrade-patch.js"></script>
  <script src="smart-lookup-pricetier.js"></script>
  <script src="shared.js"></script>
  <script type="application/ld+json">${renderFaqSchema(page.faqs)}</script>
</body>
</html>
`;
}

pages.forEach((page) => {
  fs.writeFileSync(path.join(root, `${page.slug}.html`), renderPage(page));
});

console.log(`Generated ${pages.length} SEO pages.`);
