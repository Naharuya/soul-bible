export function normalizeSource(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.text !== 'string') throw new Error('Invalid raw source.');
  // Preserve characters and references; only normalize transport line endings.
  return { ...structuredClone(raw), text: raw.text.replace(/\r\n?/g, '\n') };
}
