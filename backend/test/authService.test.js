import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, issueSessionToken, verifySessionToken } from '../services/authService.js';

test('password hashes are salted and verify without storing plaintext', async () => {
  const first = await hashPassword('Correct Horse Battery!');
  const second = await hashPassword('Correct Horse Battery!');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('Correct Horse Battery!', first), true);
  assert.equal(await verifyPassword('incorrect password', first), false);
});

test('password validation rejects short passwords', async () => {
  await assert.rejects(hashPassword('short'), /between 10 and 200/);
});

test('session tokens are signed and expire after their configured lifetime', () => {
  process.env.AUTH_TOKEN_SECRET = 'test-secret-that-is-long-enough-for-unit-tests';
  const issued = issueSessionToken({ _id: 'user-1' }, 'company-1', 'owner');
  const claims = verifySessionToken(issued.token);
  assert.equal(claims.sub, 'user-1');
  assert.equal(claims.companyId, 'company-1');
  assert.equal(claims.role, 'owner');
  assert.equal(verifySessionToken(`${issued.token}x`), null);
  assert.equal(verifySessionToken('not-a-token'), null);
});

test('session token verification requires the configured secret', () => {
  const previous = process.env.AUTH_TOKEN_SECRET;
  delete process.env.AUTH_TOKEN_SECRET;
  assert.throws(() => verifySessionToken('bad.token'), /AUTH_TOKEN_SECRET/);
  if (previous === undefined) delete process.env.AUTH_TOKEN_SECRET;
  else process.env.AUTH_TOKEN_SECRET = previous;
});
