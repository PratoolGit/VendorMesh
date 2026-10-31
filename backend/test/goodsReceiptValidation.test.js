import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGoodsReceiptInput } from '../services/goodsReceiptValidation.js';

const remaining = 10;

test('validates a clean complete delivery', () => {
  const result = normalizeGoodsReceiptInput({
    expectedQuantity: 10, deliveredQuantity: 10, acceptedQuantity: 10, damagedQuantity: 0
  }, remaining);
  assert.deepEqual(result.value, {
    expectedQuantity: 10, deliveredQuantity: 10, acceptedQuantity: 10,
    damagedQuantity: 0, missingQuantity: 0, discrepancyNotes: ''
  });
});

test('tracks partial deliveries and computes missing quantity', () => {
  const result = normalizeGoodsReceiptInput({
    expectedQuantity: 6, deliveredQuantity: 4, acceptedQuantity: 3, damagedQuantity: 1,
    discrepancyNotes: 'One unit damaged; two units short.'
  }, remaining);
  assert.equal(result.value.missingQuantity, 2);
  assert.equal(result.value.acceptedQuantity, 3);
  assert.equal(result.value.damagedQuantity, 1);
});

test('rejects quantities that are not whole numbers or exceed the order', () => {
  assert.match(normalizeGoodsReceiptInput({
    expectedQuantity: 1.5, deliveredQuantity: 1, acceptedQuantity: 1, damagedQuantity: 0
  }, remaining).error, /whole number/i);
  assert.match(normalizeGoodsReceiptInput({
    expectedQuantity: 11, deliveredQuantity: 11, acceptedQuantity: 11, damagedQuantity: 0
  }, remaining).error, /outstanding/i);
  assert.match(normalizeGoodsReceiptInput({
    expectedQuantity: 4, deliveredQuantity: 5, acceptedQuantity: 5, damagedQuantity: 0
  }, remaining).error, /no greater/i);
});

test('accepted and damaged quantities must reconcile to delivered quantity', () => {
  assert.match(normalizeGoodsReceiptInput({
    expectedQuantity: 5, deliveredQuantity: 4, acceptedQuantity: 3, damagedQuantity: 0
  }, remaining).error, /must equal/i);
});

test('discrepancies require a useful explanation', () => {
  assert.match(normalizeGoodsReceiptInput({
    expectedQuantity: 5, deliveredQuantity: 4, acceptedQuantity: 4, damagedQuantity: 0
  }, remaining).error, /short note/i);
  assert.match(normalizeGoodsReceiptInput({
    expectedQuantity: 5, deliveredQuantity: 5, acceptedQuantity: 4, damagedQuantity: 1
  }, remaining).error, /short note/i);
});

test('rejects extra fields and records when nothing remains', () => {
  assert.match(normalizeGoodsReceiptInput({ expectedQuantity: 1, deliveredQuantity: 1, acceptedQuantity: 1, damagedQuantity: 0, status: 'received' }, remaining).error, /unsupported/i);
  assert.match(normalizeGoodsReceiptInput({ expectedQuantity: 1, deliveredQuantity: 1, acceptedQuantity: 1, damagedQuantity: 0 }, 0).error, /outstanding/i);
});
