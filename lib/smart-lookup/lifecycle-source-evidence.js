// Text attributed to one URL by provider metadata. General citation lists do
// not contain claim-level evidence and intentionally yield no text here.
export function attributedText(text, annotation) {
  const start = annotation?.start_index ?? annotation?.startIndex ?? annotation?.segment?.startIndex;
  const end = annotation?.end_index ?? annotation?.endIndex ?? annotation?.segment?.endIndex;
  if (typeof text !== 'string' || !Number.isInteger(start) || !Number.isInteger(end)
    || start < 0 || end <= start || end > text.length || end - start > 1000) return null;
  return text.slice(start, end);
}

export function geminiSourceEvidence(candidate, text) {
  const metadata = candidate?.groundingMetadata;
  const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
  const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];
  return chunks.map((_, index) => supports
    .filter((support) => Array.isArray(support.groundingChunkIndices)
      && support.groundingChunkIndices.includes(index))
    .map((support) => attributedText(text, support))
    .filter(Boolean));
}
