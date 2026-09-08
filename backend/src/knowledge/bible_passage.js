import { z } from 'zod';

// Canonical names are identifiers, not translated scripture text.
const names = ['Genesis','Exodus','Leviticus','Numbers','Deuteronomy','Joshua','Judges','Ruth','1 Samuel','2 Samuel','1 Kings','2 Kings','1 Chronicles','2 Chronicles','Ezra','Nehemiah','Esther','Job','Psalms','Proverbs','Ecclesiastes','Song of Solomon','Isaiah','Jeremiah','Lamentations','Ezekiel','Daniel','Hosea','Joel','Amos','Obadiah','Jonah','Micah','Nahum','Habakkuk','Zephaniah','Haggai','Zechariah','Malachi','Matthew','Mark','Luke','John','Acts','Romans','1 Corinthians','2 Corinthians','Galatians','Ephesians','Philippians','Colossians','1 Thessalonians','2 Thessalonians','1 Timothy','2 Timothy','Titus','Philemon','Hebrews','James','1 Peter','2 Peter','1 John','2 John','3 John','Jude','Revelation'];
const codes = 'GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV'.split(' ');
const korean = '창세기 출애굽기 레위기 민수기 신명기 여호수아 사사기 룻기 사무엘상 사무엘하 열왕기상 열왕기하 역대상 역대하 에스라 느헤미야 에스더 욥기 시편 잠언 전도서 아가 이사야 예레미야 예레미야애가 에스겔 다니엘 호세아 요엘 아모스 오바댜 요나 미가 나훔 하박국 스바냐 학개 스가랴 말라기 마태복음 마가복음 누가복음 요한복음 사도행전 로마서 고린도전서 고린도후서 갈라디아서 에베소서 빌립보서 골로새서 데살로니가전서 데살로니가후서 디모데전서 디모데후서 디도서 빌레몬서 히브리서 야고보서 베드로전서 베드로후서 요한일서 요한이서 요한삼서 유다서 요한계시록'.split(' ');
export const bibleBooks = Object.freeze(Object.fromEntries(codes.map((code, i) => [code, names[i]])));
const aliases = new Map(names.flatMap((name, i) => [name, codes[i], korean[i], ...(name === 'Psalms' ? ['Psalm'] : [])].map(alias => [alias.toLowerCase(), name])));
export const vplBookAliases = Object.freeze({ SOL: 'SNG', EZE: 'EZK', JOE: 'JOL', NAH: 'NAM', MAR: 'MRK', JOH: 'JHN', PHI: 'PHP', JAM: 'JAS', '1JO': '1JN', '2JO': '2JN', '3JO': '3JN' });
for (const [alias, code] of Object.entries(vplBookAliases)) aliases.set(alias.toLowerCase(), bibleBooks[code]);
export function normalizeBibleBook(book) {
  const result = aliases.get(String(book).normalize('NFKC').trim().toLowerCase());
  if (!result) throw new Error('Unknown Bible book.');
  return result;
}
const tag = z.string().regex(/^[a-z][a-z_]*$/).max(40);
export const biblePassageSchema = z.object({
  book: z.enum(names), chapter: z.number().int().positive().max(150),
  verseStart: z.number().int().positive().max(176), verseEnd: z.number().int().positive().max(176),
  emotionTags: z.array(tag).min(1).max(12), conceptTags: z.array(tag).min(1).max(12),
}).strict().refine(p => p.verseEnd >= p.verseStart, 'Reversed Bible verse range');
export function bibleReference({ book, chapter, verseStart, verseEnd = verseStart }) {
  if (![chapter, verseStart, verseEnd].every(n => Number.isInteger(n) && n > 0) || verseEnd < verseStart) throw new Error('Invalid Bible reference.');
  return `${normalizeBibleBook(book)} ${chapter}:${verseStart}${verseEnd === verseStart ? '' : `-${verseEnd}`}`;
}
export function parseBibleReference(value) {
  const match = String(value).normalize('NFKC').trim().match(/^(.+?)\s*(\d+)\s*(?::|장)\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*절?$/u);
  if (!match) throw new Error('Invalid Bible reference.');
  const result = { book: normalizeBibleBook(match[1]), chapter: Number(match[2]), verseStart: Number(match[3]), verseEnd: Number(match[4] ?? match[3]) };
  bibleReference(result); return result;
}
export function assertBiblePassage(source) {
  const p = source.passage ?? (['book','chapter','verseStart','verseEnd','emotionTags','conceptTags'].some(key => Object.hasOwn(source.metadata ?? {}, key)) ? source.metadata : null);
  if (!p) return source; // Earlier non-passage corpora retain their contracts.
  const fields = Object.fromEntries(['book','chapter','verseStart','verseEnd','emotionTags','conceptTags'].map(key => [key, p[key]]));
  biblePassageSchema.parse(fields);
  if (source.reference !== bibleReference(p) || (source.tradition ?? source.religion) !== 'protestant' || source.sourceType !== 'bible') throw new Error('Bible reference metadata mismatch.');
  return source;
}
export function bibleReferenceMatches(reference, source) {
  try {
    assertBiblePassage(source);
    const claim = parseBibleReference(reference), evidence = parseBibleReference(source.reference);
    return claim.book === evidence.book && claim.chapter === evidence.chapter
      && claim.verseStart === evidence.verseStart && claim.verseEnd === evidence.verseEnd;
  } catch { return false; }
}
// Match known books, including numbered books, without consuming preceding prose.
const escaped = [...aliases.keys()].sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
export function bibleReferencesIn(text) {
  return [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})\\s*\\d+\\s*(?::|장)\\s*\\d+(?:\\s*[-–]\\s*\\d+)?\\s*절?`, 'giu'))].map(match => match[0].trim());
}
