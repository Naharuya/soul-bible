const categories = new Set([
  'safe', 'medical', 'violence', 'self_harm', 'passive_self_harm',
  'psychosis', 'session_crisis', 'response_crisis',
]);

// Only derived fields leave this boundary; never attach request or model text.
export function logSafetyAssessment(logger, assessment) {
  const event = {
    riskLevel: assessment.level,
    crisisTriggered: assessment.level > 0,
    category: categories.has(assessment.kind) ? assessment.kind : 'unknown',
    timestamp: new Date().toISOString(),
  };
  try {
    Promise.resolve(logger?.info?.('safety_assessment', event)).catch(() => {});
  } catch { /* Telemetry must never interrupt safety support. */ }
}
