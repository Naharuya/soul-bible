import { z } from 'zod';

export const feedbackSchema = z.object({
  submissionId: z.string().regex(/^[a-f0-9]{32}$/),
  rating: z.enum(['helpful', 'not_helpful']),
  reason: z.enum(['empathy', 'relevance', 'scripture', 'voice', 'usability', 'other']),
}).strict();

// Same process-lifetime scope as existing web metrics. Never retain conversation,
// IP, identity or free text. Bounded deduplication covers immediate retries.
export function createFeedbackMetrics() {
  const seen = new Set();
  const counts = {};
  const startedAt = new Date().toISOString();
  return {
    add(value) {
      if (seen.has(value.submissionId)) return;
      seen.add(value.submissionId);
      if (seen.size > 1000) seen.delete(seen.values().next().value);
      const key = `${value.rating}:${value.reason}`;
      counts[key] = Math.min((counts[key] ?? 0) + 1, Number.MAX_SAFE_INTEGER);
    },
    overview() { return { scope: 'since_process_start', startedAt, counts: { ...counts } }; },
  };
}
