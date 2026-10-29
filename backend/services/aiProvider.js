import crypto from 'node:crypto';
import AISettings from '../models/AISettings.js';

const PROVIDERS = {
  anthropic: {
    defaultModel: 'claude-sonnet-4-20250514',
    keyUrl: 'https://api.anthropic.com/v1/messages',
  },
  openai: {
    defaultModel: 'gpt-4o-mini',
    keyUrl: 'https://api.openai.com/v1/chat/completions',
  },
  gemini: {
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
};

function encryptionKey() {
  const secret = process.env.AI_SETTINGS_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) {
    throw new Error('AI_SETTINGS_ENCRYPTION_KEY must be set to a secret of at least 24 characters before saving AI settings.');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { keyCiphertext: ciphertext.toString('base64'), keyIv: iv.toString('base64'), keyTag: cipher.getAuthTag().toString('base64') };
}

function decrypt(record) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.keyIv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.keyTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.keyCiphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function providerDefaults(provider) {
  if (!PROVIDERS[provider]) throw new Error('Unsupported AI provider. Choose anthropic, openai, or gemini.');
  return PROVIDERS[provider];
}

export async function getAIConfig() {
  const saved = await AISettings.findOne().lean();
  if (saved) return { provider: saved.provider, model: saved.model, apiKey: decrypt(saved), configured: true, source: 'database' };

  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  return {
    provider: 'anthropic',
    model: process.env.ANTHROPIC_MODEL || PROVIDERS.anthropic.defaultModel,
    apiKey,
    configured: Boolean(apiKey),
    source: 'environment',
  };
}

export async function getPublicAIConfig() {
  const config = await getAIConfig();
  return { provider: config.provider, model: config.model, keyConfigured: Boolean(config.apiKey), source: config.source };
}

export async function saveAIConfig({ provider, model, apiKey }) {
  providerDefaults(provider);
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._:-]{2,120}$/.test(model.trim())) throw new Error('Enter a valid model ID.');
  if (typeof apiKey !== 'string' || apiKey.trim().length < 10) throw new Error('Enter a valid API key.');
  const encrypted = encrypt(apiKey.trim());
  await AISettings.findOneAndUpdate(
    {},
    { $set: { provider, model: model.trim(), ...encrypted, updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return getPublicAIConfig();
}

function openAIHistory(messages) {
  const out = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      out.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
      continue;
    }
    if (!Array.isArray(msg.content)) continue;
    if (msg.role === 'assistant') {
      const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const calls = msg.content.filter((b) => b.type === 'tool_use').map((b) => ({
        id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
      }));
      out.push({ role: 'assistant', ...(text ? { content: text } : { content: null }), ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const b of msg.content) {
        if (b.type === 'tool_result') out.push({ role: 'tool', tool_call_id: b.tool_use_id, content: b.content });
        else if (b.type === 'text') out.push({ role: 'user', content: b.text });
      }
    }
  }
  return out;
}

function geminiHistory(messages) {
  const out = [];
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      out.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
      continue;
    }
    if (!Array.isArray(msg.content)) continue;
    if (msg.role === 'assistant') {
      const parts = msg.content.flatMap((b) => b.type === 'text'
        ? [{ text: b.text }]
        : b.type === 'tool_use' ? [{ functionCall: { name: b.name, args: b.input || {} } }] : []);
      if (parts.length) out.push({ role: 'model', parts });
    } else {
      const parts = msg.content.flatMap((b) => b.type === 'tool_result'
        ? [{ functionResponse: { name: b.name || 'tool', response: { result: b.content } } }]
        : b.type === 'text' ? [{ text: b.text }] : []);
      if (parts.length) out.push({ role: 'user', parts });
    }
  }
  return out;
}

function configuredTimeout(envName, fallback = 60000) {
  const value = Number(process.env[envName]);
  // Accept sane operational limits only; invalid values fall back instead of disabling timeouts.
  return Number.isInteger(value) && value >= 5000 && value <= 180000 ? value : fallback;
}

async function timedFetch(url, options, timeoutMs = configuredTimeout('AI_REQUEST_TIMEOUT_MS')) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (err) { throw new Error(err.name === 'AbortError' ? `AI provider timed out after ${timeoutMs / 1000}s` : `AI provider network error: ${err.message}`); }
  finally { clearTimeout(timer); }
}

async function readResponse(res, label) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error?.message || data?.error?.status || data?.message || res.statusText;
    throw new Error(`${label} API ${res.status}: ${message}`);
  }
  return data;
}

function openAITools(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

function geminiSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  if (schema.type) out.type = String(schema.type).toUpperCase();
  for (const key of ['description', 'enum', 'required', 'minimum', 'maximum']) {
    if (schema[key] !== undefined) out[key] = schema[key];
  }
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, geminiSchema(value)]));
  }
  if (schema.items) out.items = geminiSchema(schema.items);
  return out;
}

function geminiTools(tools) {
  return [{ functionDeclarations: tools.map((t) => ({
    name: t.name, description: t.description, parameters: geminiSchema(t.input_schema),
  })) }];
}

export async function callAIModel(messages, systemPrompt, tools) {
  const config = await getAIConfig();
  if (!config.apiKey) throw new Error(`No API key configured for ${config.provider}. Open AI Settings and save a provider key.`);
  const provider = config.provider;

  if (provider === 'anthropic') {
    const res = await timedFetch(PROVIDERS.anthropic.keyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: config.model, max_tokens: 1500, system: systemPrompt, tools,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true }, messages,
      }),
    });
    return readResponse(res, 'Anthropic');
  }

  if (provider === 'openai') {
    const history = openAIHistory(messages);
    const res = await timedFetch(PROVIDERS.openai.keyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model, max_tokens: 1500,
        messages: [{ role: 'system', content: systemPrompt }, ...history],
        tools: openAITools(tools), tool_choice: 'auto',
      }),
    });
    const data = await readResponse(res, 'OpenAI');
    const message = data.choices?.[0]?.message || {};
    const content = [];
    if (message.content) content.push({ type: 'text', text: message.content });
    for (const call of message.tool_calls || []) {
      let input = {};
      try { input = JSON.parse(call.function?.arguments || '{}'); } catch { throw new Error('OpenAI returned malformed tool arguments.'); }
      content.push({ type: 'tool_use', id: call.id, name: call.function.name, input });
    }
    return { content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn' };
  }

  if (provider === 'gemini') {
    const url = `${PROVIDERS.gemini.keyUrl}/${encodeURIComponent(config.model)}:generateContent`;
    const res = await timedFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: geminiHistory(messages),
        tools: geminiTools(tools),
        generationConfig: { maxOutputTokens: 1500, temperature: 0.2 },
      }),
    });
    const data = await readResponse(res, 'Gemini');
    const parts = data.candidates?.[0]?.content?.parts || [];
    const content = [];
    for (const part of parts) {
      if (part.text) content.push({ type: 'text', text: part.text });
      if (part.functionCall) content.push({
        type: 'tool_use',
        id: `gemini-${crypto.randomUUID()}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      });
    }
    return { content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn' };
  }

  throw new Error('Unsupported AI provider.');
}

export async function testAIProvider({ provider, model, apiKey }) {
  providerDefaults(provider);
  if (typeof model !== 'string' || !/^[a-zA-Z0-9._:-]{2,120}$/.test(model.trim())) throw new Error('Enter a valid model ID.');
  if (typeof apiKey !== 'string' || apiKey.trim().length < 10) throw new Error('Enter a valid API key.');
  // Test keys without persisting them; use a simple provider-specific request.
  if (provider === 'anthropic') {
    const res = await timedFetch(PROVIDERS.anthropic.keyUrl, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey.trim(), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: model.trim(), max_tokens: 8, messages: [{ role: 'user', content: 'Reply with OK.' }] }),
      }, configuredTimeout('AI_TEST_TIMEOUT_MS'));
    await readResponse(res, 'Anthropic');
  } else if (provider === 'openai') {
    const res = await timedFetch(PROVIDERS.openai.keyUrl, {
      method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({ model: model.trim(), max_tokens: 8, messages: [{ role: 'user', content: 'Reply with OK.' }] }),
      }, configuredTimeout('AI_TEST_TIMEOUT_MS'));
    await readResponse(res, 'OpenAI');
  } else {
    const url = `${PROVIDERS.gemini.keyUrl}/${encodeURIComponent(model.trim())}:generateContent`;
    const res = await timedFetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with OK.' }] }], generationConfig: { maxOutputTokens: 8 } }),
      }, configuredTimeout('AI_TEST_TIMEOUT_MS'));
    await readResponse(res, 'Gemini');
  }
  return { ok: true, message: `Successfully reached ${provider} using model ${model.trim()}.` };
}
