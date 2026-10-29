import { auditIndexKey, auditKey, parseAuditField } from './diagnostic-audit.js';

export const REVIEW_COLUMNS = Object.freeze([
  'User search query', 'System result', 'Timestamp UTC', 'Request ID', 'Display status',
  'Reviewer classification', 'Reviewer notes', 'Normalized query', 'User notes',
  'Recognized brand', 'Recognized category', 'Detected model', 'Model completeness',
  'Query specificity', 'Route selected', 'Route reasons', 'Provider', 'Provider model',
  'Cache status', 'Provider outcome', 'Provider HTTP status', 'Result status',
  'Outcome reason', 'Error code', 'Year/range returned', 'Sources/citations',
  'Refinement triggered', 'Refinement result', 'Search-query count',
  'Input tokens', 'Output tokens', 'Estimated cost',
]);

export const DIAGNOSTIC_COLUMNS = Object.freeze([
  'Request ID', 'Raw provider response', 'Parsed provider response',
  'Final API response', 'Refinement provider result',
]);

export const REVIEWER_CLASSIFICATIONS = Object.freeze([
  'USEFUL_RESULT', 'USER_INPUT_ERROR', 'INSUFFICIENT_INPUT', 'CLASSIFIER_ERROR',
  'ROUTING_ERROR', 'PROVIDER_ERROR', 'PARSER_ERROR', 'LOW_QUALITY_PROVIDER_RESULT',
  'SUCCESSFUL_BUT_UNDATED', 'OTHER',
]);

export function csvCell(value) {
  let text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  // The apostrophe is retained as text by Excel and blocks formula execution.
  if (/^[\s\uFEFF]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(values) { return values.map(csvCell).join(','); }

export function exportRows(id, hash = {}) {
  const initial = parseAuditField(hash.initial) || {};
  const final = parseAuditField(hash.final) || {};
  const display = parseAuditField(hash.display);
  const refinements = Array.isArray(hash.refinements) ? hash.refinements : [];
  const refinement = refinements.at(-1) || parseAuditField(hash.refinement);
  const providerDiagnostics = Array.isArray(final.providerDiagnostics) ? final.providerDiagnostics : [];
  const review = [
    display?.rawQuery || initial.query || 'RAW_QUERY_UNAVAILABLE',
    display?.text || 'SYSTEM_RESULT_UNAVAILABLE',
    initial.timestamp, id, display?.status || 'DISPLAY_UNCONFIRMED',
    '', '', initial.normalizedQuery, initial.notes, initial.brand, initial.category,
    initial.model, initial.modelCompleteness, initial.querySpecificity,
    initial.routeSelected, initial.routeReasons, final.provider, final.providerModel,
    final.cacheStatus, final.providerOutcome, final.providerHttpStatus,
    final.resultStatus, final.outcomeReason, final.errorCode, final.yearRange,
    final.sources, refinements.length > 0 || Boolean(refinement?.triggered),
    hash.refinementTruncated ? `${refinement?.status || ''} [TRUNCATED ${hash.refinementTruncated} ATTEMPTS]` : refinement?.status || '',
    final.searchQueryCount, final.inputTokens, final.outputTokens, final.estimatedCost,
  ];
  const diagnostic = [
    id,
    providerDiagnostics.map((item) => item.rawResponse).filter(Boolean),
    providerDiagnostics.map((item) => item.parsedResponse).filter(Boolean),
    final.apiResponse || '',
    refinements.map((item) => item.providerResult).filter(Boolean),
  ];
  return { review, diagnostic };
}

export async function collectExportRows(redis, day) {
  const reviewRows = [csvRow(REVIEW_COLUMNS)];
  const diagnosticRows = [csvRow(DIAGNOSTIC_COLUMNS)];
  const indexed = await Promise.all('0123456789abcdef'.split('').map((shard) => redis.get(auditIndexKey(day, shard))));
  const ids = indexed.flatMap((value) => parseAuditField(value) || []);
  for (const id of ids || []) {
    const hash = parseAuditField(await redis.get(auditKey(id)));
    if (!hash?.initial) continue; // Daily index may outlive its records.
    const row = exportRows(id, hash);
    reviewRows.push(csvRow(row.review));
    diagnosticRows.push(csvRow(row.diagnostic));
  }
  return { reviewRows, diagnosticRows };
}
