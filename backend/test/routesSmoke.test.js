import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicAPIRouter } from '../routes/publicAPI.js';
import { createWorkspaceAPIKeysRouter } from '../routes/workspaceAPIKeys.js';
import { createWorkspaceAIRouter } from '../routes/workspaceAI.js';
import { createWorkspaceInvoicesRouter } from '../routes/workspaceInvoices.js';
import { createWorkspaceReconciliationRouter } from '../routes/workspaceReconciliation.js';

const passThrough = (_req, _res, next) => next();
const roleGate = (..._roles) => passThrough;

test('workspace AI, API key management, and public API route modules load successfully', () => {
  assert.doesNotThrow(() => createPublicAPIRouter());
  assert.doesNotThrow(() => createWorkspaceAPIKeysRouter({
    requireSession: passThrough,
    requireWorkspaceRole: roleGate
  }));
  assert.doesNotThrow(() => createWorkspaceAIRouter({
    requireSession: passThrough,
    requireWorkspaceRole: roleGate
  }));
  assert.doesNotThrow(() => createWorkspaceInvoicesRouter({
    requireSession: passThrough,
    requireWorkspaceRole: roleGate
  }));
  assert.doesNotThrow(() => createWorkspaceReconciliationRouter({
    requireSession: passThrough,
    requireWorkspaceRole: roleGate
  }));
});
