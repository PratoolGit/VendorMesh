import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import { createPublicAPIRouter } from '../routes/publicAPI.js';
import { createAPIKeyToken, hashAPIKeyToken } from '../services/workspaceAPIKeys.js';

function queryChain(value) {
  const query = {
    select() { return query; },
    sort() { return query; },
    limit() { return query; },
    lean: async () => value
  };
  return query;
}

async function createServer(models) {
  const app = express();
  app.use(createPublicAPIRouter(models));
  const server = await new Promise((resolve) => {
    const created = app.listen(0, '127.0.0.1', () => resolve(created));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function mockModels({ scopes = ['inventory:read'], expired = false, revoked = false } = {}) {
  const companyId = new mongoose.Types.ObjectId();
  const keyId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const token = createAPIKeyToken(String(keyId), 'A'.repeat(43));
  const key = {
    _id: keyId,
    companyId,
    createdBy: userId,
    keyHash: hashAPIKeyToken(token),
    scopes,
    expiresAt: new Date(Date.now() + (expired ? -60_000 : 60 * 60 * 1000)),
    revokedAt: revoked ? new Date() : null
  };
  const filters = {};
  let supplierFindCount = 0;
  let inventoryFindCount = 0;
  const models = {
    workspaceAPIKeyModel: {
      findOne(filter) {
        if (!revoked && !expired && filter._id === String(keyId)) return queryChain(key);
        return queryChain(null);
      },
      async updateOne() { return { modifiedCount: 1 }; }
    },
    userModel: {
      findById() {
        return queryChain({
          disabled: false,
          memberships: [{ companyId, status: 'active', role: 'owner' }]
        });
      }
    },
    inventoryItemModel: {
      find(filter) {
        inventoryFindCount += 1;
        filters.inventory = filter;
        return queryChain([{ _id: new mongoose.Types.ObjectId(), sku: 'SKU-1', onHand: 2, reorderPoint: 5 }]);
      }
    },
    supplierModel: {
      find(filter) {
        supplierFindCount += 1;
        filters.suppliers = filter;
        return queryChain([{ _id: new mongoose.Types.ObjectId(), name: 'Supplier A', active: true }]);
      }
    },
    purchaseRequestModel: {
      find(filter) {
        filters.requests = filter;
        return queryChain([]);
      }
    }
  };
  return {
    ...models,
    token,
    companyId,
    filters,
    counts: () => ({ supplierFindCount, inventoryFindCount })
  };
}

test('public inventory endpoint scopes every query to the API key tenant', async (t) => {
  const mock = mockModels();
  const app = await createServer(mock);
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const response = await fetch(`${app.baseUrl}/inventory?limit=5&lowStock=true`, {
    headers: { Authorization: `Bearer ${mock.token}` }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.limit, 5);
  assert.equal(body.nextCursor, null);
  assert.equal(String(mock.filters.inventory.companyId), String(mock.companyId));
  assert.deepEqual(mock.filters.inventory.$expr, { $lte: ['$onHand', '$reorderPoint'] });
});

test('public API denies endpoints not covered by the token scopes', async (t) => {
  const mock = mockModels({ scopes: ['inventory:read'] });
  const app = await createServer(mock);
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const response = await fetch(`${app.baseUrl}/suppliers`, {
    headers: { Authorization: `Bearer ${mock.token}` }
  });
  assert.equal(response.status, 403);
  assert.equal(mock.counts().supplierFindCount, 0);
});

test('public API rejects invalid, expired, or revoked keys before querying tenant data', async (t) => {
  for (const options of [{ expired: true }, { revoked: true }]) {
    const mock = mockModels(options);
    const app = await createServer(mock);
    t.after(() => new Promise((resolve) => app.server.close(resolve)));
    const response = await fetch(`${app.baseUrl}/inventory`, {
      headers: { Authorization: `Bearer ${mock.token}` }
    });
    assert.equal(response.status, 401);
    assert.equal(mock.counts().inventoryFindCount, 0);
  }
});

test('public API validates pagination before running a database query', async (t) => {
  const mock = mockModels();
  const app = await createServer(mock);
  t.after(() => new Promise((resolve) => app.server.close(resolve)));

  const response = await fetch(`${app.baseUrl}/inventory?limit=1000`, {
    headers: { Authorization: `Bearer ${mock.token}` }
  });
  assert.equal(response.status, 400);
  assert.equal(mock.counts().inventoryFindCount, 0);
});
