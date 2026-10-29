import test from 'node:test';
import assert from 'node:assert/strict';
import { rankSuppliers, scoreSupplier } from '../services/supplierMatching.js';

test('supplier ranking uses the displayed weighted reliability and lead-time formula', () => {
  const ranked = rankSuppliers([
    { _id: 'slow-high-reliability', name: 'Slow', active: true, reliabilityScore: 100, leadTimeDays: 365 },
    { _id: 'fast-balanced', name: 'Fast', active: true, reliabilityScore: 85, leadTimeDays: 5 }
  ]);
  assert.equal(ranked[0].supplier._id, 'fast-balanced');
  assert.equal(ranked[0].ranking.score, Math.round((85 * 0.7 + (100 - 5 / 3.65) * 0.3) * 100) / 100);
});

test('inactive suppliers are never recommended', () => {
  assert.equal(scoreSupplier({ _id: 'inactive', active: false, reliabilityScore: 100, leadTimeDays: 1 }), null);
  assert.deepEqual(rankSuppliers([
    { _id: 'inactive', active: false, reliabilityScore: 100, leadTimeDays: 1 }
  ]), []);
});

test('invalid or missing supplier scores are excluded instead of fabricated', () => {
  assert.equal(scoreSupplier({ _id: 'missing', active: true, leadTimeDays: 1 }), null);
  assert.equal(scoreSupplier({ _id: 'invalid', active: true, reliabilityScore: 120, leadTimeDays: 1 }), null);
  assert.equal(scoreSupplier({ _id: 'invalid-lead', active: true, reliabilityScore: 80, leadTimeDays: -1 }), null);
});
