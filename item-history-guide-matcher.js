/**
 * Item History Guide Mapper
 * Intelligently suggests relevant Item History Guide links based on search context
 * Optimized for SEO with proper link text and internal linking
 */

window.ItemHistoryGuideMatcher = (function() {
  'use strict';

  // Guide mapping: keywords/categories -> {url, title, description, category}
  const GUIDE_MAP = {
    hvac: {
      url: '/hvac-system-history',
      title: 'HVAC System History',
      description: 'Learn about furnaces, heat pumps, air conditioning evolution',
      category: 'Property Systems',
      keywords: ['hvac', 'furnace', 'air conditioner', 'ac', 'heat pump', 'boiler', 'thermostat', 'goodman', 'carrier', 'trane', 'lennox', 'york', 'rheem', 'ruud']
    },
    waterHeater: {
      url: '/water-heater-history',
      title: 'Water Heater History',
      description: 'Tank, tankless, power vent, and heat pump water heaters',
      category: 'Property Systems',
      keywords: ['water heater', 'hot water', 'tankless', 'water heating', 'rheem', 'ao smith', 'bradford white', 'state', 'richmond', 'navien', 'rinnai']
    },
    majorAppliances: {
      url: '/major-appliances-history',
      title: 'Major Appliances History',
      description: 'Refrigerators, washers, dryers, ranges, dishwashers design evolution',
      category: 'Household Items',
      keywords: ['refrigerator', 'washing machine', 'washer', 'dryer', 'range', 'oven', 'dishwasher', 'stove', 'microwave', 'appliance', 'whirlpool', 'maytag', 'ge', 'frigidaire', 'kenmore', 'samsung', 'lg', 'bosch']
    },
    tv: {
      url: '/tv-history',
      title: 'TV History',
      description: 'From black-and-white to 4K smart televisions',
      category: 'Technology',
      keywords: ['tv', 'television', 'monitor', 'screen', 'display', 'plasma', 'lcd', 'led', 'oled', 'crt', 'sony', 'panasonic', 'sharp', 'vizio', 'samsung', 'lg']
    },
    computer: {
      url: '/computer-history',
      title: 'Computer History',
      description: 'Desktop PCs, laptops, tablets, and modern portable devices',
      category: 'Technology',
      keywords: ['computer', 'laptop', 'desktop', 'pc', 'notebook', 'macbook', 'tablet', 'processor', 'dell', 'hp', 'lenovo', 'apple', 'acer', 'asus', 'ibm', 'compaq']
    },
    electrical: {
      url: '/electrical-service-panel-history',
      title: 'Electrical Service Panel History',
      description: 'Fuse boxes, breaker panels, brands, and modern standards',
      category: 'Property Systems',
      keywords: ['electrical panel', 'breaker', 'fuse box', 'service panel', 'circuit breaker', 'main breaker', 'square d', 'ge', 'siemens', 'eaton', 'federal pacific']
    },
    wiring: {
      url: '/electrical-wiring-history',
      title: 'Electrical Wiring History',
      description: 'Knob-and-tube, cloth, aluminum, copper NM cable evolution',
      category: 'Property Systems',
      keywords: ['electrical wiring', 'wiring', 'knob and tube', 'cloth wiring', 'aluminum wiring', 'copper', 'nm cable', 'romex', 'bx cable']
    }
  };

  /**
   * Find matching guides for a search query
   * @param {string} query - Search query/brand/category
   * @param {string} [category] - Optional category (appliances, electronics, hvac, water-heaters)
   * @returns {Array} Array of matching guide objects
   */
  function findMatchingGuides(query, category) {
    if (!query || typeof query !== 'string') return [];

    const normalizedQuery = query.toLowerCase().trim();
    const matches = [];
    const scoreMap = {};

    // Category-based matching (highest priority)
    if (category) {
      const categoryLower = category.toLowerCase();
      if (categoryLower.includes('hvac') || categoryLower.includes('furnace')) {
        scoreMap['hvac'] = 100;
      } else if (categoryLower.includes('water') && categoryLower.includes('heater')) {
        scoreMap['waterHeater'] = 100;
      } else if (categoryLower.includes('appliance') || categoryLower.includes('washer') || categoryLower.includes('dryer') || categoryLower.includes('refrigerator')) {
        scoreMap['majorAppliances'] = 100;
      } else if (categoryLower.includes('electronics') || categoryLower.includes('tv') || categoryLower.includes('television')) {
        scoreMap['tv'] = 80;
        scoreMap['computer'] = 60;
      } else if (categoryLower.includes('electrical') || categoryLower.includes('panel') || categoryLower.includes('breaker')) {
        scoreMap['electrical'] = 100;
        scoreMap['wiring'] = 60;
      }
    }

    // Keyword-based matching (second priority)
    Object.keys(GUIDE_MAP).forEach(guideKey => {
      const guide = GUIDE_MAP[guideKey];
      guide.keywords.forEach(keyword => {
        if (normalizedQuery.includes(keyword)) {
          const currentScore = scoreMap[guideKey] || 0;
          const keywordScore = keyword.length > 5 ? 40 : 20; // Favor exact keyword matches
          scoreMap[guideKey] = currentScore + keywordScore;
        }
      });
    });

    // Sort by score and return top matches (max 2)
    const sortedGuides = Object.keys(scoreMap)
      .sort((a, b) => scoreMap[b] - scoreMap[a])
      .slice(0, 2)
      .map(key => GUIDE_MAP[key]);

    return sortedGuides;
  }

  /**
   * Generate HTML card with guide links for results section
   * @param {string} query - Search query
   * @param {string} [category] - Optional category
   * @returns {string} HTML string or empty if no matches
   */
  function generateGuidesCard(query, category) {
    const guides = findMatchingGuides(query, category);
    if (guides.length === 0) return '';

    let html = '<div class="sl-summary-card item-history-guide-card">' +
      '<h4>📚 Learn More About This Item</h4>' +
      '<div class="guide-links-container">';

    guides.forEach(guide => {
      html += '<a href="' + guide.url + '" class="guide-link" title="' + guide.title + '">' +
        '<span class="guide-link-text">' + guide.title + '</span>' +
        '<span class="guide-link-desc">' + guide.description + '</span>' +
        '</a>';
    });

    html += '</div>' +
      '<p class="guide-footer-text"><small>Understand the evolution, brands, and how to identify this item type.</small></p>' +
      '</div>';

    return html;
  }

  /**
   * Get matching guides as JSON (for API responses)
   * @param {string} query
   * @param {string} [category]
   * @returns {Array} Array of guide objects
   */
  function getMatchingGuidesJSON(query, category) {
    return findMatchingGuides(query, category);
  }

  // Public API
  return {
    findMatchingGuides: findMatchingGuides,
    generateGuidesCard: generateGuidesCard,
    getMatchingGuidesJSON: getMatchingGuidesJSON,
    GUIDE_MAP: GUIDE_MAP
  };
})();

// Also expose globally if needed
if (typeof window !== 'undefined') {
  window.ItemHistoryGuideMatcher = window.ItemHistoryGuideMatcher;
}
