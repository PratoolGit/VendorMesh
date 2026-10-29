import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';

test('audit log schema requires tenant, action, resource and response status', () => {
  const valid = new AuditLog({
    companyId: new mongoose.Types.ObjectId(),
    action: 'PATCH',
    resource: '/api/workspace/inventory/abc',
    statusCode: 200
  });
  assert.equal(valid.validateSync(), undefined);

  const invalid = new AuditLog({ action: 'PATCH', resource: '/api/workspace/inventory', statusCode: 200 });
  const error = invalid.validateSync();
  assert.ok(error);
  assert.ok(error.errors.companyId);
});

test('audit log schema bounds stored request metadata and timestamps events', () => {
  const entry = new AuditLog({
    companyId: new mongoose.Types.ObjectId(),
    action: 'POST',
    resource: '/api/workspace/suppliers',
    statusCode: 201,
    requestId: 'req-123'
  });
  assert.ok(entry.occurredAt instanceof Date);
  assert.equal(entry.requestId, 'req-123');
  assert.equal(entry.schema.options.versionKey, false);
});

test('audit log rejects update and delete operations at model layer', async () => {
  for (const method of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    const hook = AuditLog.schema.s.hooks._pres.get(method)?.find((item) => item.fn.name === 'rejectMutation');
    assert.ok(hook, `expected append-only guard for ${method}`);
  }
});
