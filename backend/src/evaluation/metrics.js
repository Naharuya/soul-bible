export function retrievalMetrics(rows, k = 3) {
  if (!Number.isInteger(k) || k < 1 || k > 5) throw new Error('Invalid evaluation K.');
  let recall = 0, precision = 0, reciprocal = 0, relevantQueries = 0, wrong = 0, total = 0, empty = 0;
  for (const row of rows) {
    const hits = row.retrievedSources.slice(0, k);
    const expected = new Set(row.expectedSourceIds);
    const correct = new Set(hits.filter(hit => expected.has(hit.sourceId) && hit.tradition === row.tradition).map(hit => hit.sourceId));
    if (expected.size) { recall += correct.size / expected.size; relevantQueries++; }
    precision += correct.size / k;
    const first = hits.findIndex(hit => expected.has(hit.sourceId) && hit.tradition === row.tradition);
    if (first >= 0) reciprocal += 1 / (first + 1);
    wrong += hits.filter(hit => hit.tradition !== row.tradition).length;
    total += hits.length;
    if (!hits.length) empty++;
  }
  return { k, queries: rows.length, relevantQueries,
    recallAtK: relevantQueries ? recall / relevantQueries : 0,
    precisionAtK: rows.length ? precision / rows.length : 0,
    mrr: rows.length ? reciprocal / rows.length : 0,
    wrongTraditionRetrievalRate: total ? wrong / total : 0,
    emptyRetrievalRate: rows.length ? empty / rows.length : 0,
  };
}
