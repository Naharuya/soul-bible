// Human-authored discovery aliases. These are metadata, never scripture translations.
export const bibleTagAliases = Object.freeze({
  anxiety: ['불안', '걱정', 'anxiety', 'anxious', 'worry'], fear: ['두려', '무서', 'fear', 'afraid'],
  loneliness: ['외로', '외롭', 'lonely', 'loneliness'], sadness: ['슬플', '슬픔', '슬프', 'sad', 'sadness', 'grief'],
  anger: ['화가', '분노', '화날', 'anger', 'angry'], guilt: ['죄책감', 'guilt'],
  hope: ['희망', '소망', 'hope'], gratitude: ['감사', 'gratitude', 'thankful'],
  forgiveness: ['용서', 'forgiveness', 'forgive'], rest: ['쉼', '쉬고', '안식', 'rest'],
  courage: ['용기', 'courage'], trust: ['신뢰', '믿음', 'trust'], peace: ['평안', '평화', 'peace'],
  comfort: ['위로', 'comfort'], prayer: ['기도', 'prayer'], grace: ['은혜', 'grace'], love: ['사랑', 'love'],
});
export function queryBibleTags(query) {
  const text = query.normalize('NFKC').toLowerCase();
  return Object.entries(bibleTagAliases).filter(([, aliases]) => aliases.some(alias => /^[a-z]+$/.test(alias)
    ? new RegExp(`\\b${alias}\\b`, 'u').test(text) : text.includes(alias))).map(([tag]) => tag);
}
export function bibleTagOverlap(query, record) {
  if (record.tradition !== 'protestant' || !record.metadata.book) return 0;
  const requested = queryBibleTags(query), tags = [...(record.metadata.emotionTags ?? []), ...(record.metadata.conceptTags ?? [])];
  return requested.length ? requested.filter(tag => tags.includes(tag)).length / requested.length : 0;
}
