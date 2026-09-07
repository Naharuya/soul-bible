import { authorityLevels } from './contracts.js';

const normalize = text => text.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}\s]/gu, ' ');
const tokens = text => [...new Set(normalize(text).split(/\s+/u).filter(token => token.length > 1))];

// Replace rank() with semantic retrieval/re-ranking without changing agents or storage.
export const keywordRetriever = Object.freeze({
  rank({ records, query, limit }) {
    const words = tokens(query);
    return records.map(record => {
      const keywords = record.metadata.keywords.map(normalize);
      const haystack = normalize(`${record.title} ${record.text} ${keywords.join(' ')}`);
      const score = words.filter(word => haystack.includes(word)).length
        + keywords.filter(word => normalize(query).includes(word)).length * 2;
      return { record, score };
    }).filter(item => item.score > 0).sort((a, b) =>
      authorityLevels.indexOf(a.record.authorityLevel) - authorityLevels.indexOf(b.record.authorityLevel)
      || b.score - a.score || a.record.sourceId.localeCompare(b.record.sourceId))
      .slice(0, limit).map(item => item.record);
  },
});
