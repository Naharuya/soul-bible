export function createMemoryStore({ maxEntries = 1000 } = {}) {
  const memories = new Map();
  return {
    get(sessionId) {
      return memories.get(sessionId) ?? '';
    },
    set(sessionId, summary) {
      if (!summary) return;
      if (!memories.has(sessionId) && memories.size >= maxEntries) {
        memories.delete(memories.keys().next().value);
      }
      memories.set(sessionId, summary.slice(0, 4000));
    },
    clear(sessionId) { memories.delete(sessionId); },
  };
}