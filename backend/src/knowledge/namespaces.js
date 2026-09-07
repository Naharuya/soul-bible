export const knowledgeNamespaces = Object.freeze({
  protestant: 'christianity', catholic: 'catholic', buddhist: 'buddhism', jewish: 'judaism',
  islamic: 'islam', hindu: 'hinduism', confucian: 'confucianism',
});
export function validateNamespace(namespace) {
  if (!Object.values(knowledgeNamespaces).includes(namespace)) throw new Error('Unknown knowledge namespace.');
  return namespace;
}
