import test from 'node:test';
import assert from 'node:assert/strict';

function extractLgTvSeriesInfo(value) {
  const text = String(value || '').toUpperCase();
  const match = text.match(/OLED\d+[A-Z]{0,3}([BCGZM])(\d)[A-Z0-9]*/)
    || text.match(/\b([BCGZM])(\d)\b/)
    || text.match(/\b([BCGZM])(\d)[A-Z0-9]{2,}\b/);
  if (!match) return null;
  return {
    family: match[1],
    generationDigit: parseInt(match[2], 10),
  };
}

function rewriteLgTvModelToGeneration(value, targetDigit) {
  const text = String(value || '');
  if (!text || !Number.isFinite(targetDigit)) return text;

  return text
    .replace(/(OLED\d+[A-Z]{0,3})([BCGZM])(\d)([A-Z0-9]*)/i, (_, prefix, family, __, suffix) => `${prefix}${family}${targetDigit}${suffix || ''}`)
    .replace(/\b([BCGZM])(\d)([A-Z0-9]{2,})\b/i, (_, family, __, suffix) => `${family}${targetDigit}${suffix}`)
    .replace(/\b([BCGZM])(\d)\b/i, (_, family) => `${family}${targetDigit}`);
}

function maybePromoteCurrentSuccessor(result, currentDigit) {
  if (!result || typeof result !== 'object') return result;

  const summary = result.itemSummary || {};
  const successor = result.successorStatus || {};
  const options = Array.isArray(result.replacementOptions) ? result.replacementOptions : [];
  const first = options[0];
  const brand = String(summary.brand || first?.brand || successor.name || '').toLowerCase();
  const category = String(summary.category || '').toLowerCase();
  const originalInfo = extractLgTvSeriesInfo(summary.model || summary.modelNumber || summary.name || '');
  const successorInfo = extractLgTvSeriesInfo(successor.model || first?.model || successor.name || first?.name || '');

  if (brand !== 'lg') return result;
  if (category.indexOf('tv') === -1 && category.indexOf('oled') === -1) return result;
  if (!originalInfo || !successorInfo) return result;
  if (originalInfo.family !== successorInfo.family) return result;
  if (!Number.isFinite(currentDigit) || currentDigit <= successorInfo.generationDigit) return result;
  if (currentDigit <= originalInfo.generationDigit) return result;

  if (successor.model) successor.model = rewriteLgTvModelToGeneration(successor.model, currentDigit);
  if (successor.name) successor.name = rewriteLgTvModelToGeneration(successor.name, currentDigit);
  if (first?.model) first.model = rewriteLgTvModelToGeneration(first.model, currentDigit);
  if (first?.name) first.name = rewriteLgTvModelToGeneration(first.name, currentDigit);
  if (first?.retailerSearchQuery) first.retailerSearchQuery = rewriteLgTvModelToGeneration(first.retailerSearchQuery, currentDigit);
  return result;
}

test('LG C-series successor guard promotes intermediate successor to current model generation', () => {
  const payload = {
    itemSummary: {
      brand: 'LG',
      model: 'OLED65C3PUA',
      category: '65-inch 4K TV'
    },
    successorStatus: {
      type: 'direct_successor',
      name: 'LG OLED evo C4 65-inch TV',
      model: 'OLED65C4PUA',
      explanation: 'C4 is the successor.'
    },
    replacementOptions: [
      {
        name: 'LG OLED evo C4 65-inch TV',
        model: 'OLED65C4PUA',
        brand: 'LG',
        retailerSearchQuery: 'LG OLED65C4PUA'
      }
    ]
  };

  const output = maybePromoteCurrentSuccessor(payload, 5);
  assert.equal(output.successorStatus.model, 'OLED65C5PUA');
  assert.equal(output.replacementOptions[0].model, 'OLED65C5PUA');
  assert.equal(output.replacementOptions[0].retailerSearchQuery, 'LG OLED65C5PUA');
});

test('LG successor guard leaves already-current model alone', () => {
  const payload = {
    itemSummary: {
      brand: 'LG',
      model: 'OLED65C3PUA',
      category: '65-inch 4K TV'
    },
    successorStatus: {
      type: 'direct_successor',
      name: 'LG OLED evo C5 65-inch TV',
      model: 'OLED65C5PUA'
    },
    replacementOptions: [
      {
        name: 'LG OLED evo C5 65-inch TV',
        model: 'OLED65C5PUA',
        brand: 'LG'
      }
    ]
  };

  const output = maybePromoteCurrentSuccessor(payload, 5);
  assert.equal(output.successorStatus.model, 'OLED65C5PUA');
  assert.equal(output.replacementOptions[0].model, 'OLED65C5PUA');
});

test('LG successor guard does not rewrite non-TV categories', () => {
  const payload = {
    itemSummary: {
      brand: 'LG',
      model: 'WM4000HWA',
      category: 'Front-Load Washer'
    },
    successorStatus: {
      type: 'direct_successor',
      name: 'LG WM4100HWA',
      model: 'WM4100HWA'
    },
    replacementOptions: [
      {
        name: 'LG WM4100HWA',
        model: 'WM4100HWA',
        brand: 'LG'
      }
    ]
  };

  const output = maybePromoteCurrentSuccessor(payload, 5);
  assert.equal(output.successorStatus.model, 'WM4100HWA');
  assert.equal(output.replacementOptions[0].model, 'WM4100HWA');
});
