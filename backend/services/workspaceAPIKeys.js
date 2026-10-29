import crypto from 'node:crypto';

export const WORKSPACE_API_SCOPES = Object.freeze([
  'inventory:read',
  'suppliers:read',
  'purchasing:read'
]);

export function normalizeAPIKeyRequest(body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Provide API key settings.' };
  const allowed = new Set(['name', 'scopes', 'expiresInDays']);
  if (Object.keys(body).some((field) => !allowed.has(field))) return { error: 'Unsupported API key field.' };

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 3 || name.length > 80) {
    return { error: 'API key name must be 3–80 characters.' };
  }
  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    return { error: 'Select at least one read-only API scope.' };
  }
  if (body.scopes.some((scope) => !WORKSPACE_API_SCOPES.includes(scope))) {
    return { error: 'One or more API scopes are not supported. Public API keys are read-only.' };
  }
  const scopes = [...new Set(body.scopes)];
  const expiresInDays = body.expiresInDays === undefined ? 90 : Number(body.expiresInDays);
  if (!Number.isSafeInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
    return { error: 'API key expiry must be an integer from 1 to 365 days.' };
  }
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(expiresAt.getTime())) return { error: 'Invalid API key expiry.' };
  return { value: { name, scopes, expiresInDays, expiresAt } };
}

export function createAPIKeyToken(id, secret = crypto.randomBytes(32).toString('base64url')) {
  if (!/^[a-f0-9]{24}$/i.test(String(id))) throw new Error('Invalid API key identifier.');
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new Error('Invalid API key secret.');
  return `vmk_${String(id).toLowerCase()}.${secret}`;
}

export function parseAPIKeyToken(token) {
  if (typeof token !== 'string' || token.length > 128) return null;
  const match = /^vmk_([a-f0-9]{24})\.([A-Za-z0-9_-]{43})$/i.exec(token);
  return match ? { id: match[1].toLowerCase() } : null;
}

export function hashAPIKeyToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function constantTimeHashMatches(expectedHex, suppliedHex) {
  if (typeof expectedHex !== 'string' || typeof suppliedHex !== 'string'
    || !/^[a-f0-9]{64}$/i.test(expectedHex) || !/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  return crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(suppliedHex, 'hex'));
}
