import { authorityLevels } from './contracts.js';
import { bibleTagOverlap } from './bible_tags.js';
import { bibleReferencesIn, bibleReferenceMatches } from './bible_passage.js';

const normalize = text => text.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}\s]/gu, ' ');
const tokens = text => [...new Set(normalize(text).split(/\s+/u).filter(token => token.length > 1))];

// Replace rank() with semantic retrieval/re-ranking without changing agents or storage.
export const keywordRetriever = Object.freeze({
  rank({ records, query, limit }) {
    const words = tokens(query);
    const references = bibleReferencesIn(query);
    return records.filter(record => !record.metadata.book || !references.length || references.some(reference => bibleReferenceMatches(reference, record))).map(record => {
      const keywords = record.metadata.keywords.map(normalize);
      const haystack = normalize(`${record.title} ${record.text} ${keywords.join(' ')}`);
      const score = words.filter(word => haystack.includes(word)).length
        + keywords.filter(word => normalize(query).includes(word)).length * 2 + bibleTagOverlap(query, record) * 4
        + (record.metadata.book && references.some(reference => bibleReferenceMatches(reference, record)) ? 8 : 0);
      return { record, score };
    }).filter(item => item.score > 0).sort((a, b) =>
      authorityLevels.indexOf(a.record.authorityLevel) - authorityLevels.indexOf(b.record.authorityLevel)
      || b.score - a.score || a.record.sourceId.localeCompare(b.record.sourceId))
      .slice(0, limit).map(item => item.record);
  },
});
