import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKSPACE_API_SCOPES,
  normalizeAPIKeyRequest,
  createAPIKeyToken,
  parseAPIKeyToken,
  hashAPIKeyToken,
  constantTimeHashMatches
} from '../services/workspaceAPIKeys.js';

test('API key creation validates name, scopes, and a bounded expiry', () => {
  const result = normalizeAPIKeyRequest({
    name: 'ERP reporting connector',
    scopes: ['inventory:read', 'suppliers:read', 'inventory:read'],
    expiresInDays: 30
  }, new Date('2026-10-29T00:00:00.000Z'));
  assert.equal(result.error, undefined);
  assert.deepEqual(result.value.scopes, ['inventory:read', 'suppliers:read']);
  assert.equal(result.value.expiresAt.toISOString(), '2026-11-28T00:00:00.000Z');
  assert.equal(normalizeAPIKeyRequest({ name: 'API', scopes: ['payments:write'] }).error !== undefined, true);
  assert.equal(normalizeAPIKeyRequest({ name: 'valid name', scopes: ['inventory:read'], expiresInDays: 366 }).error !== undefined, true);
});

test('API tokens are parseable but only a hash should be stored', () => {
  const token = createAPIKeyToken('64f1a123456789abcdef0123', 'A'.repeat(43));
  assert.deepEqual(parseAPIKeyToken(token), { id: '64f1a123456789abcdef0123' });
  assert.equal(parseAPIKeyToken('vmk_64f1a123456789abcdef0123.bad-token'), null);
  const hash = hashAPIKeyToken(token);
  assert.notEqual(hash, token);
  assert.equal(hash.length, 64);
  assert.equal(constantTimeHashMatches(hash, hash), true);
  assert.equal(constantTimeHashMatches(hash, '0'.repeat(64)), false);
});

test('public key scopes are read-only and finite', () => {
  assert.deepEqual(WORKSPACE_API_SCOPES, ['inventory:read', 'suppliers:read', 'purchasing:read']);
  assert.equal(WORKSPACE_API_SCOPES.some((scope) => scope.endsWith(':write')), false);
});
