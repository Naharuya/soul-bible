export const normalizeEvidence = text => text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
const stronger = /반드시|무조건|절대|유일|보장|always|guaranteed|only/iu;

// Plug in a separately evaluated semantic evaluator later. Deterministic and synchronous for now.
export const exactCitationEvaluator = Object.freeze({
  evaluate({ claim, sources }) {
    const normalized = normalizeEvidence(claim);
    const grounded = sources.some(source => !source.metadata?.sample && normalizeEvidence(source.text).includes(normalized)
      && (!stronger.test(normalized) || stronger.test(source.text)));
    return { supported: grounded, exceedsEvidence: !grounded && stronger.test(normalized) };
  },
});

export function referenceMatches(reference, source) {
  // Compare complete reference tokens; 1:1 must never authorize 1:10 or 1:11.
  const normalized = normalizeEvidence(reference);
  const candidate = normalizeEvidence(source.reference);
  return candidate === normalized || candidate.startsWith(`${normalized} `) || candidate.startsWith(`${normalized} (`);
}
