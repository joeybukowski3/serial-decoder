import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupModelProduction } from '../../lib/model-era-lookup.js';

const loggedCases = [
  { brand: 'GE', model: 'PFD87ESPV0RS', candidates: [1977, 1989, 2001, 2013, 2025], expected: [2025] },
  { brand: 'GE', model: 'PFD87ESPVRS', candidates: [1977, 1989, 2001, 2013, 2025], expected: [2025] },
  { brand: 'GE', model: 'GNE27JYMFS', candidates: [2006, 2016, 2026], expected: [2026] },
  { brand: 'Samsung', model: 'RF28R7351SR', candidates: [2006, 2016, 2026], expected: [2026] },
  { brand: 'Samsung', model: 'WF45T6000AW', candidates: [2006, 2016, 2026], expected: [2026] },
  { brand: 'LG', model: 'LFXS28968S', candidates: [2006, 2016, 2026], expected: [2016, 2026] },
  { brand: 'KitchenAid', model: 'KRFF305ESS', candidates: [2006, 2016, 2026], expected: [2016, 2026] },
  { brand: 'LG', model: 'WM3470HWA', candidates: [2004, 2014, 2024], expected: null },
  { brand: 'Whirlpool', model: 'WMH31017HS12', candidates: [1994, 2024], expected: null },
  { brand: 'Frigidaire', model: 'FFTR2045VS0', candidates: [1991, 2001, 2011, 2021], expected: null },
  { brand: 'GE', model: 'JB258DM1WW', candidates: [1983, 1995, 2007, 2019], expected: null },
  { brand: 'GE', model: 'GTS18GTHWW', candidates: [1996, 2006, 2016], expected: null },
  { brand: 'Whirlpool', model: 'WRF767SDHZ', candidates: [2006, 2016, 2026], expected: null },
  { brand: 'Maytag', model: 'MVWC565FW', candidates: [2006, 2016, 2026], expected: null },
  { brand: 'Electrolux', model: 'EI23BC36IS', candidates: [2006, 2016, 2026], expected: null },
];

test('15 logged model numbers narrow only on unambiguous exact or wildcard-family matches', async () => {
  for (const fixture of loggedCases) {
    const result = await lookupModelProduction(fixture.brand, fixture.model, fixture.candidates);
    if (fixture.expected === null) {
      assert.equal(result, null, `${fixture.brand} ${fixture.model}`);
      continue;
    }

    assert.deepEqual(result?.narrowedYears, fixture.expected, `${fixture.brand} ${fixture.model}`);
    assert.equal(result?.confidence, 'low', `${fixture.brand} ${fixture.model}`);
    assert.equal(result?.sourceUrl, 'https://data.energystar.gov/', `${fixture.brand} ${fixture.model}`);
    assert.ok(result?.productionStartYear, `${fixture.brand} ${fixture.model}`);
    assert.ok(result.narrowedYears.every((year) => fixture.candidates.includes(year)), `${fixture.brand} ${fixture.model}`);
  }
});

test('a concrete model requires exact identity and reports medium confidence', async () => {
  const result = await lookupModelProduction('Amana', ' ama31s5e ', [2008, 2018, 2028]);
  assert.deepEqual(result?.narrowedYears, [2018, 2028]);
  assert.equal(result?.matchType, 'exact');
  assert.equal(result?.confidence, 'medium');
  assert.equal(result?.productionStartYear, 2018);
});

test('brand mismatch and an unapproved one-edit near-match return null', async () => {
  assert.equal(await lookupModelProduction('Samsung', 'PFD87ESPVRS', [2013, 2025]), null);
  assert.equal(await lookupModelProduction('GE', 'GFW850SPNXDG', [1984, 1996, 2008, 2020]), null);
});
