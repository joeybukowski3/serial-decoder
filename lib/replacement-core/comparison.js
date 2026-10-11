export function buildComparisonRows(hardComparisons, similarityComparisons) {
  const high = similarityComparisons.filter((row) => row.bucket === 'STRONG' && row.weightClass === 'HIGH');
  const normal = similarityComparisons.filter((row) => row.bucket === 'STRONG' && row.weightClass === 'NORMAL');
  const meaningfulSecondary = similarityComparisons.filter((row) => row.bucket === 'SECONDARY' && ['DIFFERENT', 'BETTER', 'FAIL'].includes(row.assessment));
  return [
    ...hardComparisons,
    ...high.slice(0, 5),
    ...normal.filter((row) => row.assessment === 'DIFFERENT').slice(0, 2),
    ...meaningfulSecondary.slice(0, 1),
  ].slice(0, 12);
}
