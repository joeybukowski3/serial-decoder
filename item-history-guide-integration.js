/**
 * Item History Guide Integration for Smart Lookup & Decoder
 * Automatically injects guide suggestions into search results
 * Optimized for SEO with proper internal linking
 */

(function() {
  'use strict';

  var observerSmartLookup = null;
  var observerDecoder = null;

  // Wait for DOM to be ready
  function initializeGuideIntegration() {
    // Check if matcher is available
    if (typeof window.ItemHistoryGuideMatcher === 'undefined') {
      console.warn('ItemHistoryGuideMatcher not available, guide integration disabled');
      return;
    }

    // Monitor for Smart Lookup results
    monitorSmartLookupResults();
    
    // Monitor for Decoder results
    monitorDecoderResults();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
      if (observerSmartLookup) observerSmartLookup.disconnect();
      if (observerDecoder) observerDecoder.disconnect();
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
   * Monitor Decoder results and inject guide cards.
   *
   * #serialSummaryLayer is a static node present in the page markup at load
   * time (see decoder-tool.html) — decodeSerial()/renderSerialSummaryLayer()
   * in script.js never remove or replace it, they only overwrite its
   * innerHTML on every decode and refinement. Watching document.body for the
   * layer to be *added* therefore never matches past the first paint, so we
   * observe the persistent layer itself for the childList mutation that
   * innerHTML replacement actually produces.
   */
  function monitorDecoderResults() {
    try {
      var summaryLayer = document.getElementById('serialSummaryLayer');
      if (!summaryLayer) return;

      var observer = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
          if (mutations[i].addedNodes.length) {
            try {
              injectGuideCardIntoDecoder(summaryLayer);
            } catch (e) {
              console.warn('Error processing Decoder result:', e);
            }
            break;
          }
        }
      });

      observer.observe(summaryLayer, {
        childList: true,
        subtree: false
      });

      observerDecoder = observer;
    } catch (e) {
      console.warn('Failed to initialize Decoder monitoring:', e);
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
   * Inject guide card into Decoder result.
   *
   * summaryLayer is the persistent #serialSummaryLayer node, so a
   * data-guide-injected attribute set on it would survive every future
   * decode/refinement re-render and permanently block later results from
   * getting a card. renderSerialSummaryLayer() in script.js already builds
   * its own .item-history-guide-card inline via the same matcher whenever
   * one applies, so this only needs to fill the gap on the rare render where
   * that inline content is absent — checking for that content directly (not
   * a standing attribute) is what keeps a valid re-render from being skipped
   * and keeps this from ever appending a second, duplicate card.
   */
  function injectGuideCardIntoDecoder(summaryLayer) {
    if (summaryLayer.classList.contains('hidden')) return;

    var guideSection = summaryLayer.querySelector('.serial-guide-section');
    if (guideSection && guideSection.querySelector('.item-history-guide-card')) return;

    // Get search context from the page
    var query = getDecoderQuery();
    var category = getDecoderCategory();

    // Generate guide card
    var guideCard = generateGuideCard(query, category);
    if (guideCard) {
      // Insert in the serial-guide-section if it exists, or before serial-bottom-grid
      var bottomGrid = summaryLayer.querySelector('.serial-bottom-grid');

      if (guideSection) {
        guideSection.appendChild(guideCard);
      } else if (bottomGrid) {
        bottomGrid.parentNode.insertBefore(guideCard, bottomGrid);
      } else {
        summaryLayer.appendChild(guideCard);
      }
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

  /**
   * Get current Decoder search query
   */
  function getDecoderQuery() {
    var serialInput = document.getElementById('serial');
    if (serialInput && serialInput.value) return serialInput.value;
    
    var queryChip = document.querySelector('.serial-query-chip');
    if (queryChip) {
      return queryChip.textContent.replace('Search Query: ', '').trim();
    }
    return '';
  }

  /**
   * Get Decoder category
   */
  function getDecoderCategory() {
    var activeTab = document.querySelector('.search-tab.active');
    if (activeTab && activeTab.getAttribute('data-cat')) {
      return activeTab.getAttribute('data-cat');
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
