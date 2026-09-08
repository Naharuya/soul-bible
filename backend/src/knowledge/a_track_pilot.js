import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PublicDomainVplAdapter } from './bible_corpus_adapter.js';
import { sourceRegistrySchema, registerSource } from './expert_registry.js';
import { contentChecksum } from './production_guard.js';
import { chunkSourceId } from './ingestion/enrichment.js';
import { expertPackage, packageCsv } from './expert_package.js';

export function prepareATrack({ registry: input, bytes, metadata, selections }) {
  let registry = sourceRegistrySchema.parse(input);
  if (registry.environment !== 'production' || registry.sources.some(source => source.tradition !== 'protestant')) throw new Error('A-track requires the production Christianity registry.');
  const adapter = new PublicDomainVplAdapter();
  adapter.loadSource(bytes, metadata);
  const candidates = adapter.createChunks(selections);
  for (const source of candidates) registry = registerSource(registry, source);
  if (registry.sources.length > 50) throw new Error('A-track pilot exceeds 50 source passages.');
  return { registry, candidates };
}

// Labels are proposed from manually assigned tags, not independent expert Gold.
export function aTrackGold(candidates, safetyQuestions = []) {
  const cases = [
    ['anxiety', '불안할 때 도움이 되는 말씀', 'emotion'], ['fear', '두려울 때', 'emotion'],
    ['loneliness', '외로울 때', 'emotion'], ['sadness', '슬플 때', 'emotion'],
    ['anger', '화가 날 때', 'emotion'], ['guilt', '죄책감이 있을 때', 'emotion'],
    ['hope', '희망이 필요할 때', 'emotion'], ['gratitude', '감사하고 싶을 때', 'emotion'],
    ['forgiveness', '용서에 대해 묵상하고 싶어요', 'concept'], ['rest', '쉼이 필요해요', 'concept'],
    ['courage', '용기를 얻고 싶어요', 'concept'], ['peace', '평안을 구하고 싶어요', 'concept'],
    ['prayer', '기도에 관한 구절', 'concept'],
    ['unrelated', '화성 탐사선의 연료 효율', 'negative'], ['fake-reference', '요한복음 99:99', 'negative'],
  ];
  const questions = cases.map(([tag, question, kind]) => {
    const expected = candidates.filter(source => kind === 'emotion' ? source.passage.emotionTags.includes(tag)
      : kind === 'concept' && source.passage.conceptTags.includes(tag));
    return { id: `a-track-${tag}`, tradition: 'protestant', question, split: 'evaluation', category: kind,
      expectedConcepts: kind === 'concept' ? [tag] : [], expectedEmotionTags: kind === 'emotion' ? [tag] : [],
      expectedConceptTags: kind === 'concept' ? [tag] : [],
      expectedSourceCriteria: { ids: expected.map(source => chunkSourceId(source, 0, source.text)), language: 'en-US', allowEmpty: kind === 'negative' },
      mustNotRetrieve: { otherTraditions: true }, mustNotContain: ['fabricated Bible reference'],
      safetyExpectation: 'normal', citationExpectation: kind === 'negative' ? 'no citation' : 'grounded passage only',
      labelStatus: 'pending_expert_review', labelMethod: 'manual_tag_derived_candidate_not_independent_gold' };
  });
  return [...questions, ...safetyQuestions.filter(q => q.split === 'evaluation' && q.category === 'safety conflict')];
}

export async function loadATrackSnapshot(directory, selectionPath) {
  const [bytes, metadataBytes, provenanceBytes, licenseBytes, selectionBytes] = await Promise.all([
    readFile(join(directory, 'selected.vpl.txt')), readFile(join(directory, 'source.json')),
    readFile(join(directory, 'provenance.json')), readFile(join(directory, 'engwebp_about.htm')), readFile(selectionPath),
  ]);
  const metadata = JSON.parse(metadataBytes), evidence = JSON.parse(provenanceBytes), selections = JSON.parse(selectionBytes);
  if (evidence.subsetSha256 !== contentChecksum(bytes) || metadata.checksum !== evidence.subsetSha256
      || evidence.licenseSha256 !== contentChecksum(licenseBytes) || evidence.selectionSha256 !== contentChecksum(selectionBytes)
      || evidence.downloadUrl !== metadata.sourceUrl || !/^[a-f0-9]{64}$/.test(evidence.archiveSha256)
      || !/^[a-f0-9]{64}$/.test(evidence.entrySha256) || !Number.isFinite(Date.parse(evidence.acquiredAt))
      || Date.parse(evidence.acquiredAt) > Date.now() || evidence.candidatePassages !== selections.length
      || !metadata.provenance.includes(evidence.archiveSha256) || !metadata.provenance.includes(evidence.entrySha256)) throw new Error('Snapshot provenance/checksum mismatch.');
  return { bytes, metadata, selections, evidence };
}

export async function aTrackCommand(args) {
  const [command, ...options] = args;
  if (command !== 'prepare') throw new Error('Expected prepare. Review/build/evaluate use the existing expert and Christianity CLIs.');
  const required = ['registry', 'source-dir', 'selections', 'output'], values = {};
  for (let i = 0; i < options.length; i += 2) {
    const key = options[i]?.slice(2), value = options[i + 1];
    if (!options[i]?.startsWith('--') || !required.includes(key) || Object.hasOwn(values, key) || !value || value.startsWith('--')) throw new Error('Invalid A-track option.');
    values[key] = value;
  }
  if (required.some(key => !values[key])) throw new Error('Missing A-track option.');
  const snapshot = await loadATrackSnapshot(values['source-dir'], values.selections);
  const result = prepareATrack({ ...snapshot, registry: JSON.parse(await readFile(values.registry, 'utf8')) });
  const safety = JSON.parse(await readFile(new URL('../../evaluation/gold-candidate-v1.json', import.meta.url), 'utf8'));
  const pack = expertPackage(result.registry);
  const summary = { upstreamSources: 1, registeredPassageSources: result.registry.sources.length,
    candidateChunks: result.candidates.length, approvedChunks: 0, actualCorpusApproval: 'BLOCKED_EXTERNAL_REVIEW',
    corpusVersion: null, indexVersion: null, release: 'BLOCKED_RELEASE',
    sourceVersion: snapshot.metadata.sourceVersion, sourceChecksum: snapshot.metadata.checksum,
    licenseStatus: snapshot.metadata.licenseStatus, licenseReview: 'pending', provenanceStatus: 'snapshot_hashes_verified',
    sourceLanguage: snapshot.metadata.language, queryLanguage: 'ko-KR', textTranslation: 'none',
    externalModelApiCalls: 0, externalEmbeddingApiCalls: 0, commandNetworkCalls: 0,
    productionDefault: 'keyword', hybrid: 'experimental',
  };
  await mkdir(values.output, { recursive: false });
  const files = { 'candidate-registry.json': result.registry, 'gold-candidate.json': aTrackGold(result.candidates, safety),
    'candidate-passages.json': result.registry.sources.filter(source => result.candidates.some(c => c.sourceId === source.sourceId))
      .map(({ passage, ...source }) => ({ ...source, ...passage })),
    'expert-package.json': pack, 'review-submission.json': { environment: pack.environment,
      registryFingerprint: pack.registryFingerprint, decisions: pack.rows.map(row => row.nextReview).filter(Boolean) }, 'summary.json': summary };
  for (const [name, value] of Object.entries(files)) await writeFile(join(values.output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  await writeFile(join(values.output, 'expert-package.csv'), packageCsv(pack), { flag: 'wx' });
  return summary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await aTrackCommand(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
