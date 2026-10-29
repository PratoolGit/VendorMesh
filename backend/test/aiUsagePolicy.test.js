import test from 'node:test';
import assert from 'node:assert/strict';
import { getDailyAIRequestLimit, safeTokenCount, extractAIAnswer } from '../services/aiUsagePolicy.js';

test('daily AI usage limits are bounded and default to 25', () => {
  assert.equal(getDailyAIRequestLimit('10'), 10);
  assert.equal(getDailyAIRequestLimit('0'), 25);
  assert.equal(getDailyAIRequestLimit('999999'), 25);
  assert.equal(getDailyAIRequestLimit('abc'), 25);
});

test('token counters accept only safe non-negative integers', () => {
  assert.equal(safeTokenCount(12), 12);
  assert.equal(safeTokenCount(-1), null);
  assert.equal(safeTokenCount(1.5), null);
  assert.equal(safeTokenCount(Number.MAX_VALUE), null);
});

test('AI answer extraction returns text only and enforces output length', () => {
  assert.equal(extractAIAnswer({ content: [{ type: 'text', text: ' Advice ' }, { type: 'tool_use', input: { secret: 'not text' } }] }), 'Advice');
  assert.equal(extractAIAnswer({ content: [{ type: 'tool_use' }] }), '');
});
