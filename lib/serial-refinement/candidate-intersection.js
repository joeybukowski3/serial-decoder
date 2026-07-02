export function parseCandidateYears(value) {
  const values = Array.isArray(value) ? value : String(value || '').match(/\b(?:19|20)\d{2}\b/g) || [];
  return normalizeCandidateYears(values);
}

export function normalizeCandidateYears(values) {
  const years = [];
  const seen = new Set();
  for (const value of values || []) {
    const year = Number.parseInt(String(value), 10);
    if (!Number.isInteger(year) || year < 1800 || year > 2200 || seen.has(year)) continue;
    seen.add(year);
    years.push(year);
  }
  return years.sort((a, b) => a - b);
}

export function parseYearRange(value, options = {}) {
  if (!value && value !== 0) return null;
  const currentYear = options.currentYear || new Date().getUTCFullYear();

  if (typeof value === 'object' && !Array.isArray(value)) {
    const start = value.start ?? value.min ?? value.productionStart ?? value.availabilityStart ?? null;
    const end = value.end ?? value.max ?? value.productionEnd ?? value.availabilityEnd ?? null;
    const normalizedStart = start == null ? null : Number.parseInt(String(start), 10);
    const normalizedEnd = end == null ? null : Number.parseInt(String(end), 10);
    if (normalizedStart != null && !Number.isInteger(normalizedStart)) return null;
    if (normalizedEnd != null && !Number.isInteger(normalizedEnd)) return null;
    if (normalizedStart != null && normalizedEnd != null && normalizedStart > normalizedEnd) return null;
    return { start: normalizedStart, end: normalizedEnd };
  }

  const text = String(value).trim().toLowerCase().replace(/[–—]/g, '-');
  if (!text) return null;

  const single = text.match(/^((?:18|19|20|21)\d{2})$/);
  if (single) {
    const year = Number.parseInt(single[1], 10);
    return { start: year, end: year };
  }

  const range = text.match(/((?:18|19|20|21)\d{2})\s*(?:-|to|through)\s*((?:18|19|20|21)\d{2}|present|current)/i);
  if (range) {
    const start = Number.parseInt(range[1], 10);
    const end = /present|current/i.test(range[2]) ? currentYear : Number.parseInt(range[2], 10);
    if (start > end) return null;
    return { start, end };
  }

  const openStart = text.match(/(?:since|from|post[-\s]*)\s*((?:18|19|20|21)\d{2})/i);
  if (openStart) {
    return { start: Number.parseInt(openStart[1], 10), end: null };
  }

  const openEnd = text.match(/(?:before|pre[-\s]*|through)\s*((?:18|19|20|21)\d{2})/i);
  if (openEnd) {
    const year = Number.parseInt(openEnd[1], 10);
    return { start: null, end: /before|pre/i.test(openEnd[0]) ? year - 1 : year };
  }

  return null;
}

export function intersectCandidateYears(candidateYears, range) {
  const candidates = normalizeCandidateYears(candidateYears);
  if (!range) return candidates;
  return candidates.filter((year) => {
    if (range.start != null && year < range.start) return false;
    if (range.end != null && year > range.end) return false;
    return true;
  });
}

export function intersectRanges(ranges) {
  const valid = (ranges || []).filter(Boolean);
  if (!valid.length) return null;
  let start = null;
  let end = null;
  for (const range of valid) {
    if (range.start != null) start = start == null ? range.start : Math.max(start, range.start);
    if (range.end != null) end = end == null ? range.end : Math.min(end, range.end);
  }
  if (start != null && end != null && start > end) {
    return { start, end, conflict: true };
  }
  return { start, end, conflict: false };
}

export function resolveCandidateIntersection({
  candidateYears,
  evidenceRange,
  evidenceAvailable = false,
  evidenceSufficient = false,
}) {
  const candidates = normalizeCandidateYears(candidateYears);
  if (!candidates.length) {
    return {
      status: 'unavailable',
      candidateYears: [],
      remainingCandidateYears: [],
      chosenYear: null,
    };
  }

  if (!evidenceAvailable || !evidenceSufficient || !evidenceRange) {
    return {
      status: 'unavailable',
      candidateYears: candidates,
      remainingCandidateYears: candidates,
      chosenYear: null,
    };
  }

  if (evidenceRange.conflict) {
    return {
      status: 'conflict',
      candidateYears: candidates,
      remainingCandidateYears: [],
      chosenYear: null,
    };
  }

  const remaining = intersectCandidateYears(candidates, evidenceRange);
  if (remaining.length === 1) {
    return {
      status: 'resolved',
      candidateYears: candidates,
      remainingCandidateYears: remaining,
      chosenYear: remaining[0],
    };
  }
  if (remaining.length > 1) {
    return {
      status: 'ambiguous',
      candidateYears: candidates,
      remainingCandidateYears: remaining,
      chosenYear: null,
    };
  }
  return {
    status: 'conflict',
    candidateYears: candidates,
    remainingCandidateYears: [],
    chosenYear: null,
  };
}
