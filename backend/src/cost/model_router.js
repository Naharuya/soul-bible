export const taskTiers = Object.freeze({
  crisis: 'local', self_harm: 'local', immediate_safety: 'local', rule: 'local', greeting: 'local',
  bible_search: 'rag', religion_search: 'rag', emotion: 'cheap', intent: 'cheap',
  memory_summary: 'cheap', empathy: 'cheap', conversation: 'standard', integrated: 'standard',
  complex_faith: 'premium', complex: 'premium',
});
const tiers = ['local', 'rag', 'cheap', 'standard', 'premium'];

// Server-side rules only. Client-provided plan/task/complexity fields are ignored.
export function classifyTask(body) {
  const text = body.userMessage.trim();
  if (/^(안녕(?:하세요)?|고마워(?:요)?|감사합니다|네|응|괜찮아요)[.!?\s]*$/.test(text)) return 'greeting';
  if (/(찾아|검색|구절|자료)/.test(text) && !/(설명|해석|비교|논증)/.test(text)) {
    if (/(성경|말씀|시편|복음|구절)/.test(text)) return 'bible_search';
    if (/(불교|가톨릭|천주교|이슬람|유교|종교)/.test(text)) return 'religion_search';
  }
  if (text.length > 160 && /(비교|모순|신정론|교리|논증)/.test(text)) return 'complex_faith';
  if (/^(위로|공감)(해\s?줘|해\s?주세요|가 필요해요)[.!?\s]*$/.test(text)) return 'empathy';
  return 'conversation';
}

export function routeModel({ taskType = 'conversation', costTier = 'standard' } = {}, env = process.env) {
  if (costTier === 'blocked' || !tiers.includes(costTier)) return { tier: 'local', model: null };
  const desired = taskTiers[taskType] ?? 'standard';
  const tier = tiers[Math.min(tiers.indexOf(desired), tiers.indexOf(costTier))];
  if (tier === 'local' || tier === 'rag') return { tier, model: null };
  return { tier, model: env[`OPENAI_${tier.toUpperCase()}_MODEL`]?.trim() || env.OPENAI_MODEL?.trim() || 'gpt-5.6' };
}
