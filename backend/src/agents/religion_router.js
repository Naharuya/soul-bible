import { religionSchema } from './agent_contracts.js';
import { religionAgent as protestant } from './religions/protestant_agent.js';
import { religionAgent as catholic } from './religions/catholic_agent.js';
import { religionAgent as buddhist } from './religions/buddhist_agent.js';
import { religionAgent as jewish } from './religions/jewish_agent.js';
import { religionAgent as islamic } from './religions/islamic_agent.js';
import { religionAgent as hindu } from './religions/hindu_agent.js';
import { religionAgent as confucian } from './religions/confucian_agent.js';
export { religionIds } from './agent_contracts.js';

const specialists = new Map([protestant, catholic, buddhist, jewish, islamic, hindu, confucian].map((agent) => [agent.id, agent]));
// TODO: Connect the optional religion field to a future Flutter religion selection UI.
export function routeReligion(religion = 'protestant') {
  return specialists.get(religionSchema.parse(religion));
}

const mentions = {
  protestant: /개신교|기독교|성경|예수|\b(?:christianity|christian|protestant|bible)\b/iu,
  catholic: /가톨릭|천주교|성사|묵주|\bcatholic\b/iu,
  buddhist: /불교|부처|불경|\bbuddhis(?:m|t)\b/iu,
  jewish: /유대교|토라|타나크|\b(?:judaism|jewish|torah)\b/iu,
  islamic: /이슬람|무슬림|꾸란|쿠란|코란|\b(?:islam|muslim|quran)\b/iu,
  hindu: /힌두교|바가바드|\bhindu(?:ism)?\b/iu,
  confucian: /유교|공자|논어|\bconfucian(?:ism)?\b/iu,
};

export function detectTraditions(userMessage = '') {
  const text = userMessage.normalize('NFKC');
  let candidates = Object.entries(mentions).filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
  // Bible/Jesus are shared vocabulary, not evidence of Protestant context in a Catholic question.
  if (candidates.includes('catholic') && !/개신교|기독교|\b(?:christianity|protestant|christian)\b/iu.test(text)) {
    candidates = candidates.filter((id) => id !== 'protestant');
  }
  return candidates;
}

export function comparisonTraditions({ religion, userMessage = '' }) {
  if (religion !== undefined || !/비교|차이|각각|어떻게.{0,15}(?:보|설명|이해)|\bcompare\b|\bdiffer/iu.test(userMessage)) return [];
  const candidates = detectTraditions(userMessage);
  return candidates.length >= 2 && candidates.length <= 3 ? candidates : [];
}

export function resolveReligion({ religion, userMessage = '' } = {}) {
  if (religion !== undefined) return { tradition: religionSchema.parse(religion), reason: 'selected' };
  const candidates = detectTraditions(userMessage);
  if (candidates.length > 1) return { tradition: null, reason: 'ambiguous' };
  if (candidates.length === 1) return { tradition: candidates[0], reason: 'question' };
  // Preserve the existing Bible app default for old clients without a selection.
  return { tradition: 'protestant', reason: 'legacy_default' };
}
