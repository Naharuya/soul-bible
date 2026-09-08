import { z } from 'zod';
import { createHash } from 'node:crypto';
import { bibleBooks, normalizeBibleBook, bibleReference, parseBibleReference, biblePassageSchema } from './bible_passage.js';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const required = z.string().trim().min(1);
export const bibleSourcePolicySchema = z.object({
  sourceId: required, title: required, publisher: required, institution: required, sourceVersion: required,
  sourceUrl: z.string().url().refine(url => url.startsWith('https://')),
  licenseStatus: z.enum(['public_domain', 'official_permission', 'licensed']),
  licenseEvidence: required, provenance: required, language: z.literal('en-US'),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export class BibleCorpusAdapter {
  loadSource() { throw new Error('Implement loadSource.'); }
  normalizeBooks() { throw new Error('Implement normalizeBooks.'); }
  normalizeReference() { throw new Error('Implement normalizeReference.'); }
  createChunks() { throw new Error('Implement createChunks.'); }
  buildMetadata() { throw new Error('Implement buildMetadata.'); }
}

// Offline VPL adapter. Downloading, expert decisions and activation are separate operations.
export class PublicDomainVplAdapter extends BibleCorpusAdapter {
  #verses; #metadata;
  loadSource(bytes, metadata) {
    this.#verses = undefined; this.#metadata = undefined;
    const checked = bibleSourcePolicySchema.parse(metadata);
    if (!Buffer.isBuffer(bytes) || sha(bytes) !== checked.checksum) throw new Error('Source checksum mismatch.');
    const verses = new Map();
    for (const line of new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const match = line.match(/^([A-Z0-9]{3}) (\d+):(\d+) (.+)$/u);
      if (!match) throw new Error('Invalid VPL verse.');
      const key = this.normalizeReference(`${match[1]} ${match[2]}:${match[3]}`);
      if (verses.has(key) || !match[4].trim()) throw new Error('Duplicate/empty VPL verse.');
      verses.set(key, match[4]);
    }
    if (!verses.size) throw new Error('Empty Bible source.');
    this.#metadata = checked; this.#verses = verses;
    return { verseCount: verses.size, checksum: checked.checksum };
  }
  normalizeBooks(book) { return normalizeBibleBook(book); }
  normalizeReference(reference) { return bibleReference(parseBibleReference(reference)); }
  buildMetadata(selection) {
    if (!this.#metadata) throw new Error('Load a verified source first.');
    const passage = biblePassageSchema.parse({ ...selection, book: this.normalizeBooks(selection.book) });
    const reference = bibleReference(passage), m = this.#metadata;
    return { sourceId: `${m.sourceId}:${Object.keys(bibleBooks).find(code => bibleBooks[code] === passage.book).toLowerCase()}:${passage.chapter}:${passage.verseStart}-${passage.verseEnd}`,
      tradition: 'protestant', traditionBranch: 'general', sourceType: 'bible', title: `${m.title} — ${reference}`,
      publisher: m.publisher, institution: m.institution, sourceUrl: m.sourceUrl, language: m.language, originalLanguage: 'he/el',
      licenseStatus: m.licenseStatus, licenseEvidence: m.licenseEvidence, provenance: m.provenance,
      sourceVersion: m.sourceVersion, reference, authorityLevel: 'primary',
      expectedUsage: 'A-track English passage pilot; Korean manual discovery tags only. Context, tradition and safety review required; no clinical promises.',
      keywords: [...new Set([...passage.emotionTags, ...passage.conceptTags])], qualityScore: 0.8, passage };
  }
  createChunks(selections) {
    if (!this.#verses || !Array.isArray(selections) || selections.length < 20 || selections.length > 50) throw new Error('Pilot requires 20–50 selected passages from a verified source.');
    const used = new Set();
    return selections.map(selection => {
      const metadata = this.buildMetadata(selection), passage = metadata.passage, texts = [];
      for (let verse = passage.verseStart; verse <= passage.verseEnd; verse++) {
        const key = bibleReference({ book: passage.book, chapter: passage.chapter, verseStart: verse });
        if (!this.#verses.has(key) || used.has(key)) throw new Error('Missing or overlapping Bible verse.');
        used.add(key); texts.push(this.#verses.get(key));
      }
      // Preserve verse text and ordering, joining only the VPL line boundaries.
      const text = texts.join(' ');
      if (text.length > 3500) throw new Error('Passage exceeds reviewed chunk size.');
      return { ...metadata, text, checksum: sha(text) };
    });
  }
}
