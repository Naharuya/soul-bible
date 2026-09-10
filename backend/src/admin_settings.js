import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createConversationService } from './conversation_service.js';

export function createAdminSettings({ directory, env = process.env, usageLedger, factory = createConversationService }) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const masterPath = join(directory, 'master.key');
  const settingsPath = join(directory, 'settings.enc');
  let master;
  try { master = readFileSync(masterPath); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    master = randomBytes(32);
    writeFileSync(masterPath, master, { flag: 'wx', mode: 0o600 });
  }
  let saved = null;
  try {
    const data = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const decipher = createDecipheriv('aes-256-gcm', master, Buffer.from(data.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
    saved = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.data, 'base64')), decipher.final()]).toString());
  } catch (error) { if (error.code !== 'ENOENT') throw new Error('Admin settings unavailable'); }
  const keyFor = value => value === null ? (env.OPENAI_API_KEY || '') : value.apiKey;
  const build = value => factory({ env: { ...env, OPENAI_API_KEY: keyFor(value) }, usageLedger });
  let current = build(saved);
  const generate = (...args) => current(...args);
  generate.usageLedger = usageLedger;
  Object.defineProperty(generate, 'mode', { get: () => current.mode });
  function status() {
    return { configured: Boolean(keyFor(saved)), source: saved === null ? (keyFor(saved) ? 'environment' : 'none') : 'admin',
      mode: current.mode, updatedAt: saved?.updatedAt || null };
  }
  function update(apiKey) {
    const next = { apiKey, updatedAt: new Date().toISOString() };
    const service = build(next);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', master, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(next), 'utf8'), cipher.final()]);
    const temporary = join(directory, 'settings.tmp');
    writeFileSync(temporary, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 });
    renameSync(temporary, settingsPath);
    saved = next;
    current = service;
    return status();
  }
  return { generate, status, update };
}
