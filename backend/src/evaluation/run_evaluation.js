import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createReligionKnowledgeProvider } from '../knowledge/provider.js';
import { keywordRetriever } from '../knowledge/retriever.js';
import { retrievalMetrics } from './metrics.js';
import { createResponseReview } from './response_review.js';
import { assessSafety } from '../agents/safety_agent.js';

export async function evaluateRetrieval({ questions, provider, k = 3 }) {
  const rows = []; const reviews = [];
  for (const question of questions) {
    const safety = assessSafety({ userMessage: question.question, emotion: '불안', intensity: 6, conversationState: {} });
    if (safety) {
      reviews.push(createResponseReview({ ...question, retrievedSources: [], answer: safety.message, safetyResult: 'crisis_intercepted' }));
      continue;
    }
    // Ground-truth tradition selection evaluates retrieval separately from router quality.
    // Comparison sources remain in separate rows, never a merged retrieval target.
    for (const tradition of question.expectedTradition) {
      const found = await provider.search({ tradition, query: question.question, language: 'ko-KR', limit: k });
      const row = { questionId: question.id, question: question.question, tradition,
        expectedSourceIds: question.expectedSourceIds.filter(id => id.startsWith(`${tradition}:`)),
        retrievedSources: found.results.map(({ sourceId, tradition, reference, authorityLevel }) => ({ sourceId, tradition, reference, authorityLevel })),
      };
      rows.push(row);
      reviews.push(createResponseReview({ ...row, mustNotContain: question.mustNotContain, safetyResult: 'no_crisis_detected' }));
    }
  }
  return { metrics: retrievalMetrics(rows, k), rows, reviews };
}

export async function runEvaluation({ outputDirectory = new URL('../../evaluation/results/', import.meta.url) } = {}) {
  const questions = JSON.parse(await readFile(new URL('../../evaluation/questions.json', import.meta.url), 'utf8'));
  const baseline = await evaluateRetrieval({ questions, provider: createReligionKnowledgeProvider({ retriever: keywordRetriever }) });
  const hybrid = await evaluateRetrieval({ questions, provider: createReligionKnowledgeProvider() });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(new URL('retrieval-report.json', outputDirectory), JSON.stringify({ scope: 'self-authored synthetic evaluation; no LLM answers', baseline: baseline.metrics, hybrid: hybrid.metrics, rows: hybrid.rows }, null, 2));
  await writeFile(new URL('expert-review.json', outputDirectory), JSON.stringify(hybrid.reviews, null, 2));
  return { baseline: baseline.metrics, hybrid: hybrid.metrics };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await runEvaluation(), null, 2));
}
