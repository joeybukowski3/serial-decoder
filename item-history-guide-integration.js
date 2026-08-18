/**
 * Item History Guide Integration for Smart Lookup & Decoder
 * Automatically injects guide suggestions into search results
 * Optimized for SEO with proper internal linking
 */

(function() {
  'use strict';

  var observerSmartLookup = null;

  // Wait for DOM to be ready
  function initializeGuideIntegration() {
    // Check if matcher is available
    if (typeof window.ItemHistoryGuideMatcher === 'undefined') {
      console.warn('ItemHistoryGuideMatcher not available, guide integration disabled');
      return;
    }

    // Monitor for Smart Lookup results
    monitorSmartLookupResults();

    // Decoder guide cards are rendered directly by renderSerialSummaryLayer()
    // in script.js on every decode/refinement — no observer needed here.

    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
      if (observerSmartLookup) observerSmartLookup.disconnect();
    });
  }

  /**
   * Monitor Smart Lookup results and inject guide cards
   */
  function monitorSmartLookupResults() {
    try {
      var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if (mutation.addedNodes.length) {
            mutation.addedNodes.forEach(function(node) {
              try {
                // Check if this is a Smart Lookup result container
                if (node.nodeType === 1) { // Element node
                  if (node.classList && node.classList.contains('sl-top-summary-layer')) {
                    injectGuideCardIntoSmartLookup(node);
                  } else if (node.querySelectorAll) {
                    var summaryLayer = node.querySelector('.sl-top-summary-layer');
                    if (summaryLayer && !summaryLayer.hasAttribute('data-guide-injected')) {
                      injectGuideCardIntoSmartLookup(summaryLayer);
                    }
                  }
                }
              } catch (e) {
                console.warn('Error processing Smart Lookup node:', e);
              }
            });
          }
        });
      });

      var resultsContainer = document.body;
      observer.observe(resultsContainer, {
        childList: true,
        subtree: true,
        attributes: false
      });
      
      observerSmartLookup = observer;
    } catch (e) {
      console.warn('Failed to initialize Smart Lookup monitoring:', e);
    }
  }

  /**
   * Inject guide card into Smart Lookup result
   */
  function injectGuideCardIntoSmartLookup(summaryLayer) {
    if (summaryLayer.hasAttribute('data-guide-injected')) return;
    
    // Get search context from the page
    var query = getSmartLookupQuery();
    var category = getSmartLookupCategory();

    // Generate guide card
    var guideCard = generateGuideCard(query, category);
    if (guideCard) {
      // Insert after the action row or before the first details element
      var actionRow = summaryLayer.querySelector('.sl-action-row');
      var insertPoint = actionRow ? actionRow.nextSibling : summaryLayer.firstChild;
      
      if (insertPoint) {
        insertPoint.parentNode.insertBefore(guideCard, insertPoint.nextSibling);
      } else {
        summaryLayer.appendChild(guideCard);
      }
      
      summaryLayer.setAttribute('data-guide-injected', 'true');
    }
  }

  /**
   * Generate guide card element
   */
  function generateGuideCard(query, category) {
    if (typeof window.ItemHistoryGuideMatcher === 'undefined') return null;
    
    var html = window.ItemHistoryGuideMatcher.generateGuidesCard(query, category);
    if (!html) return null;

    var container = document.createElement('div');
    container.className = 'serial-guide-section item-history-section';
    container.innerHTML = html;
    return container;
  }

  /**
   * Get current Smart Lookup search query
   */
  function getSmartLookupQuery() {
    var input = document.getElementById('smart-lookup-input');
    if (input && input.value) return input.value;
    
    // Fallback: extract from result identity
    var identityBar = document.querySelector('.sl-result-identity-bar');
    if (identityBar) {
      return identityBar.textContent.trim();
    }
    return '';
  }

  /**
   * Get Smart Lookup category
   */
  function getSmartLookupCategory() {
    var categorySelector = document.querySelector('[data-category]');
    if (categorySelector && categorySelector.getAttribute('data-category')) {
      return categorySelector.getAttribute('data-category');
    }
    
    var breadcrumb = document.querySelector('.sl-breadcrumb');
    if (breadcrumb) {
      return breadcrumb.textContent.trim();
    }
    return '';
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGuideIntegration);
  } else {
    initializeGuideIntegration();
  }
})();
