import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../services/rateLimit.js';

function invoke(limiter, ip = '192.0.2.10') {
  const headers = {};
  let continued = false;
  const res = {
    statusCode: 200, body: null,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  limiter({ ip }, res, () => { continued = true; });
  return { ...res, headers, continued };
}

test('rate limiter allows the configured request count and then returns 429', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2, now: () => 1_000 });
  assert.equal(invoke(limiter).continued, true);
  assert.equal(invoke(limiter).continued, true);
  const blocked = invoke(limiter);
  assert.equal(blocked.statusCode, 429);
  assert.equal(blocked.continued, false);
  assert.equal(blocked.headers['Retry-After'], '60');
});

test('rate limit windows reset and different IPs use separate buckets', () => {
  let clock = 1_000;
  const limiter = createRateLimiter({ windowMs: 1_000, maxRequests: 1, now: () => clock });
  assert.equal(invoke(limiter, '192.0.2.10').continued, true);
  assert.equal(invoke(limiter, '192.0.2.11').continued, true);
  assert.equal(invoke(limiter, '192.0.2.10').statusCode, 429);
  clock = 2_001;
  assert.equal(invoke(limiter, '192.0.2.10').continued, true);
});

test('rate limiter validates its configuration', () => {
  assert.throws(() => createRateLimiter({ windowMs: 0 }), /windowMs/);
  assert.throws(() => createRateLimiter({ maxRequests: 0 }), /maxRequests/);
});
