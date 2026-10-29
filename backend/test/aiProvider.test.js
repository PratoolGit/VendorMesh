import test from 'node:test';
import assert from 'node:assert/strict';
import { testAIProvider } from '../services/aiProvider.js';
import AISettings from '../models/AISettings.js';
import mongoose from 'mongoose';
import { getAIConfig, getPublicAIConfigForCompany, saveAIConfig } from '../services/aiProvider.js';

const originalFetch = globalThis.fetch;
const originalFindOne = AISettings.findOne;
const originalFindOneAndUpdate = AISettings.findOneAndUpdate;
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY;
const originalEncryptionKey = process.env.AI_SETTINGS_ENCRYPTION_KEY;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  AISettings.findOne = originalFindOne;
  AISettings.findOneAndUpdate = originalFindOneAndUpdate;
  if (originalAnthropicApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey;
  if (originalEncryptionKey === undefined) delete process.env.AI_SETTINGS_ENCRYPTION_KEY;
  else process.env.AI_SETTINGS_ENCRYPTION_KEY = originalEncryptionKey;
});

test('rejects unknown AI providers before making a network request', async () => {
  await assert.rejects(
    testAIProvider({ provider: 'unknown', model: 'model-x', apiKey: 'abcdefghijk' }),
    /Unsupported AI provider/,
  );
});

test('rejects malformed API keys', async () => {
  await assert.rejects(
    testAIProvider({ provider: 'openai', model: 'gpt-4o-mini', apiKey: 'short' }),
    /valid API key/,
  );
});

for (const provider of ['anthropic', 'openai', 'gemini']) {
  test(`tests ${provider} credentials without persisting the key`, async () => {
    let requestedUrl = '';
    let requestedBody = '';
    globalThis.fetch = async (url, options) => {
      requestedUrl = String(url);
      requestedBody = options.body || '';
      return new Response(JSON.stringify({ ok: true, candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const result = await testAIProvider({ provider, model: 'test-model-1', apiKey: 'test-key-123456789' });
    assert.equal(result.ok, true);
    assert.match(result.message, new RegExp(provider));
    assert.ok(requestedUrl.includes(provider === 'anthropic' ? 'anthropic.com' : provider === 'openai' ? 'openai.com' : 'googleapis.com'));
    assert.ok(requestedBody.includes('Reply with OK.'));
  });
}


test('AI settings distinguish global legacy configuration from company-scoped settings', () => {
  const indexes = AISettings.schema.indexes();
  const scoped = indexes.find(([fields, options]) => fields.companyId === 1 && options.unique);
  assert.ok(scoped, 'expected a unique workspace settings index');
  assert.equal(scoped[1].partialFilterExpression.companyId.$type, 'objectId');
  assert.ok(AISettings.schema.path('keyLast4'));
});


test('workspace AI config never falls back to a global environment credential', async () => {
  const companyId = new mongoose.Types.ObjectId();
  let seenFilter;
  process.env.ANTHROPIC_API_KEY = 'legacy-global-provider-secret';
  AISettings.findOne = (filter) => {
    seenFilter = filter;
    return { lean: async () => null };
  };

  const config = await getAIConfig({ companyId });
  assert.deepEqual(seenFilter, { companyId });
  assert.equal(config.apiKey, '');
  assert.equal(config.configured, false);
  assert.equal(config.source, 'workspace');
});

test('workspace credentials are encrypted and only a masked key status is returned', async () => {
  const companyId = new mongoose.Types.ObjectId();
  const providedKey = 'sk-provider-secret-abcdef9876';
  let stored;
  process.env.AI_SETTINGS_ENCRYPTION_KEY = 'test-only-encryption-secret-long-enough-to-hash';

  AISettings.findOneAndUpdate = async (filter, update) => {
    stored = { ...filter, ...update.$set };
    return stored;
  };
  AISettings.findOne = (filter) => ({
    lean: async () => String(filter.companyId) === String(companyId) ? stored : null
  });

  const publicConfig = await saveAIConfig({
    companyId,
    provider: 'openai',
    model: 'gpt-4o-mini',
    apiKey: providedKey
  });
  assert.equal(String(stored.companyId), String(companyId));
  assert.ok(stored.keyCiphertext);
  assert.notEqual(stored.keyCiphertext, Buffer.from(providedKey).toString('base64'));
  assert.equal(publicConfig.keyConfigured, true);
  assert.equal(publicConfig.maskedKey, '••••' + providedKey.slice(-4));
  assert.equal(Object.hasOwn(publicConfig, 'apiKey'), false);
  assert.equal(JSON.stringify(publicConfig).includes(providedKey), false);

  const publicAgain = await getPublicAIConfigForCompany(companyId);
  assert.equal(publicAgain.maskedKey, '••••' + providedKey.slice(-4));
  assert.equal(Object.hasOwn(publicAgain, 'apiKey'), false);
});
