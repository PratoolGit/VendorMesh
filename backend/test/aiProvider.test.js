import test from 'node:test';
import assert from 'node:assert/strict';
import { testAIProvider } from '../services/aiProvider.js';
import AISettings from '../models/AISettings.js';

const originalFetch = globalThis.fetch;

test.afterEach(() => { globalThis.fetch = originalFetch; });

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
