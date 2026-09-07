import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { knowledgeRecordSchema } from './contracts.js';
import { knowledgeNamespaces } from './namespaces.js';
import { assertProductionSource, contentChecksum } from './production_guard.js';

const version = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/);
export const indexManifestSchema = z.object({
  indexVersion: version, corpusVersion: version, createdAt: z.string().datetime(),
  tradition: z.enum(Object.keys(knowledgeNamespaces)), sourceIds: z.array(z.string()).min(1),
  sourceCount: z.number().int().positive(), corpusFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  embeddingProvider: z.literal('none'), embeddingVersion: z.literal('none'),
  retrievalMode: z.literal('keyword'), buildStatus: z.literal('validated'),
}).strict();

export function validateIndexSnapshot(snapshot) {
  const manifest = indexManifestSchema.parse(snapshot.manifest);
  const records = z.array(knowledgeRecordSchema).min(1).max(10000).parse(snapshot.records);
  records.forEach(assertProductionSource);
  const ids = records.map(record => record.sourceId);
  const fingerprint = contentChecksum(JSON.stringify(records));
  if (records.some(record => record.tradition !== manifest.tradition)
      || new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify(manifest.sourceIds)
      || records.length !== manifest.sourceCount || fingerprint !== manifest.corpusFingerprint
      || fingerprint !== manifest.sourceFingerprint) throw new Error('Invalid index manifest or namespace.');
  return { manifest, records };
}

// One atomic registry replacement publishes all namespace pointers and lifecycle states.
// Immutable snapshot files are never overwritten. The lock rejects concurrent writers.
export function createProductionIndex(root) {
  const directory = resolve(root);
  const registryPath = join(directory, 'registry.json');
  async function registry() {
    try { return JSON.parse(await readFile(registryPath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { indexes: {}, active: {}, history: {} }; throw error; }
  }
  async function save(state) {
    const temporary = join(directory, `${randomUUID()}.tmp`);
    try {
      const file = await open(temporary, 'wx');
      try { await file.writeFile(JSON.stringify(state, null, 2)); await file.sync(); } finally { await file.close(); }
      await rename(temporary, registryPath);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async function mutate(action) {
    await mkdir(directory, { recursive: true });
    const lockPath = join(directory, 'writer.lock');
    const lock = await open(lockPath, 'wx');
    try { return await action(await registry()); }
    finally { await lock.close(); await unlink(lockPath); }
  }
  async function inspectSnapshot(id) {
    version.parse(id);
    return JSON.parse(await readFile(join(directory, `${id}.json`), 'utf8'));
  }
  async function snapshot(id) {
    const result = validateIndexSnapshot(await inspectSnapshot(id));
    if (result.manifest.indexVersion !== id) throw new Error('Index version mismatch.');
    return result;
  }
  async function activateState(state, id, rollback = false) {
    const entry = state.indexes[id];
    if (!entry || !(rollback ? ['validated', 'retired'] : ['validated']).includes(entry.status)) throw new Error('Only validated indexes can activate.');
    let checked;
    try { checked = await snapshot(id); }
    catch (error) { entry.status = 'failed'; await save(state); throw error; }
    const tradition = checked.manifest.tradition;
    if (entry.tradition !== tradition) throw new Error('Index namespace mismatch.');
    const previous = state.active[tradition];
    if (previous) state.indexes[previous].status = 'retired';
    state.history[tradition] = [...(state.history[tradition] ?? []).filter(value => value !== id), ...(previous ? [previous] : [])];
    state.active[tradition] = id;
    entry.status = 'active';
    await save(state);
    return checked.manifest;
  }
  return Object.freeze({
    directory, registry, snapshot, inspectSnapshot,
    async build({ indexVersion, corpusVersion, tradition, records }) {
      version.parse(indexVersion); version.parse(corpusVersion);
      if (!Object.hasOwn(knowledgeNamespaces, tradition)) throw new Error('Unknown namespace.');
      return mutate(async state => {
        if (Object.hasOwn(state.indexes, indexVersion)) throw new Error('Index version already exists.');
        state.indexes[indexVersion] = { tradition, status: 'building' };
        await save(state);
        try {
          const parsed = records.map(record => knowledgeRecordSchema.parse(record));
          const fingerprint = contentChecksum(JSON.stringify(parsed));
          const data = validateIndexSnapshot({ records: parsed, manifest: {
            indexVersion, corpusVersion, tradition, createdAt: new Date().toISOString(),
            sourceIds: parsed.map(record => record.sourceId), sourceCount: parsed.length,
            sourceFingerprint: fingerprint, corpusFingerprint: fingerprint,
            embeddingProvider: 'none', embeddingVersion: 'none', retrievalMode: 'keyword', buildStatus: 'validated',
          } });
          const file = await open(join(directory, `${indexVersion}.json`), 'wx');
          try { await file.writeFile(JSON.stringify(data, null, 2)); await file.sync(); } finally { await file.close(); }
          state.indexes[indexVersion].status = 'validated';
          await save(state);
          return data.manifest;
        } catch (error) {
          state.indexes[indexVersion].status = 'failed';
          await save(state);
          throw error;
        }
      });
    },
    activate(id) { version.parse(id); return mutate(state => activateState(state, id)); },
    rollback(tradition) {
      return mutate(state => {
        const previous = state.history[tradition]?.at(-1);
        if (!previous) throw new Error('No previous validated index.');
        return activateState(state, previous, true);
      });
    },
    async resolveActive(tradition) {
      const state = await registry();
      const id = state.active[tradition];
      if (!id) return null;
      if (state.indexes[id]?.status !== 'active' || state.indexes[id]?.tradition !== tradition) throw new Error('Invalid active index.');
      const result = await snapshot(id);
      if (result.manifest.tradition !== tradition) throw new Error('Active namespace mismatch.');
      return result;
    },
  });
}

export function activeIndexStore(index) {
  return Object.freeze({ async load(namespace, { signal } = {}) {
    signal?.throwIfAborted();
    const tradition = Object.keys(knowledgeNamespaces).find(key => knowledgeNamespaces[key] === namespace);
    if (!tradition) throw new Error('Unknown namespace.');
    const active = await index.resolveActive(tradition);
    signal?.throwIfAborted();
    return active?.records ?? [];
  } });
}
