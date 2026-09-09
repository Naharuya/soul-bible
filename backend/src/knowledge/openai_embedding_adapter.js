import { validateTexts, validateVector, withEmbeddingDeadline } from './embedding_provider.js';

// Client construction is lazy; supplying only the normal chat API key cannot enable this adapter.
export function createOpenAiEmbeddingAdapter({ env = {}, clientFactory, timeoutMs = 1500 } = {}) {
  const enabled = env.SOUL_EMBEDDING_ENABLED === 'true' && env.SOUL_EMBEDDING_PROVIDER === 'openai'
    && typeof env.OPENAI_API_KEY === 'string' && Boolean(env.OPENAI_API_KEY.trim())
    && !/\s/.test(env.OPENAI_API_KEY) && typeof env.OPENAI_EMBEDDING_MODEL === 'string'
    && /^[a-zA-Z0-9_.-]{1,80}$/.test(env.OPENAI_EMBEDDING_MODEL);
  let client;
  return Object.freeze({
    id: enabled ? `openai:${env.OPENAI_EMBEDDING_MODEL}` : 'openai:disabled', external: true,
    async embed(text, options) { return (await this.embedBatch([text], options))[0]; },
    async embedBatch(texts, { signal } = {}) {
      if (!enabled) throw new Error('External embeddings disabled.');
      validateTexts(texts);
      return withEmbeddingDeadline(async activeSignal => {
        if (!client) {
          const factory = clientFactory ?? (async options => { const { default: OpenAI } = await import('openai'); return new OpenAI(options); });
          client = await factory({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: timeoutMs,
            baseURL: 'https://api.openai.com/v1', logLevel: 'off' });
        }
        activeSignal.throwIfAborted();
        const response = await client.embeddings.create({ model: env.OPENAI_EMBEDDING_MODEL, input: texts, encoding_format: 'float' }, { signal: activeSignal, timeout: timeoutMs, maxRetries: 0 });
        activeSignal.throwIfAborted();
        if (!Array.isArray(response.data) || response.data.length !== texts.length) throw new Error('Invalid embedding response.');
        const ordered = [...response.data].sort((a, b) => a.index - b.index);
        if (ordered.some((item, index) => item.index !== index)) throw new Error('Invalid embedding indexes.');
        const dimensions = ordered[0]?.embedding?.length;
        return ordered.map(item => validateVector(item.embedding, dimensions));
      }, { signal, timeoutMs });
    },
  });
}
