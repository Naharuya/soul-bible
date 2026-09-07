const authority = { primary: 1, official: 0.85, scholarly: 0.65, secondary: 0.3 };
export function explainRetrievalConfidence({ sources, tradition, topScore = 0, secondScore = 0,
  traditionBranch, citationResult = 'not_run', ambiguous = false }) {
  const result = (score, components, reason) => ({ score, band: score < 0.4 ? 'low' : score < 0.75 ? 'medium' : 'high', components, reason });
  if (!sources.length || sources.some(source => source.religion !== tradition)
      || (traditionBranch && sources.some(source => source.metadata?.traditionBranch !== traditionBranch))
      || ['rejected', 'repaired', 'no_sources'].includes(citationResult)) return result(0, {}, 'missing_or_invalid_evidence');
  const evidence = sources.filter(source => !source.metadata?.sample);
  if (!evidence.length) return result(ambiguous ? 0.14 : 0.2, { sampleCap: 0.2 }, 'development_samples_only');
  const bounded = score => Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0));
  const components = { top1: 0.35 * bounded(topScore), margin: evidence.length > 1 ? 0.1 * Math.max(0, bounded(topScore) - bounded(secondScore)) : 0,
    count: 0.15 * Math.min(evidence.length / 3, 1), authority: 0.2 * Math.max(...evidence.map(source => authority[source.authorityLevel] ?? 0.1)),
    citation: citationResult === 'passed' ? 0.2 : 0, ambiguityFactor: ambiguous ? 0.7 : 1,
    traditionMatch: 1, branchMatch: traditionBranch ? 1 : 0 };
  const score = Math.round(Math.min(1, (components.top1 + components.margin + components.count + components.authority + components.citation) * components.ambiguityFactor) * 1000) / 1000;
  return result(score, components, 'heuristic_not_statistically_calibrated');
}

export function calculateRetrievalConfidence(input) { return explainRetrievalConfidence(input).score; }

export function noAnswerReligion() {
  return { perspective: '현재 연결된 자료에서는 이 질문에 대해 충분히 신뢰할 만한 근거를 찾지 못했습니다.',
    guidance: '지금 필요한 돌봄을 먼저 살펴보셔도 괜찮습니다.', reflectionQuestion: '어떤 도움이 가장 필요하신가요?', sourceRefs: [], cautions: [] };
}

export function applyRetrievalConfidence(output, confidence) {
  if (!Object.hasOwn(output, 'tradition')) return output;
  // Existing optional emotional support remains unchanged. Only asserted religious insight is weakened.
  const asserted = /(?:교리|경전|구원|윤회|신의 뜻|가르침).{0,35}(?:입니다|이다|확실|반드시)/u.test(output.religiousInsight);
  const fields = [output.religiousInsight, output.suggestedPractice?.guidance ?? '', output.suggestedPractice?.reflectionQuestion ?? '', ...(output.caution ?? [])].join(' ');
  if (confidence < 0.4 && /(?:[\p{L}]+\s*\d+\s*[:장]\s*\d+)|[“”「」『』"]|(?:교리|경전).{0,20}(?:반드시|유일|절대)/u.test(fields)) {
    const safe = noAnswerReligion();
    return { ...output, confidence, religiousInsight: safe.perspective, suggestedPractice: { guidance: safe.guidance, reflectionQuestion: safe.reflectionQuestion }, sourceHints: [], caution: [] };
  }
  return { ...output, confidence,
    religiousInsight: confidence < 0.4 && asserted ? '확실한 근거를 찾지 못했습니다. 이 주장은 신뢰할 수 있는 자료로 더 확인해야 합니다.' : output.religiousInsight,
  };
}
