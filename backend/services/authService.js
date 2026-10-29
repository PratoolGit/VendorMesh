import crypto from 'node:crypto';

const TOKEN_TTL_SECONDS = 60 * 60 * 12;

function tokenSecret() {
  const secret = process.env.AUTH_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_TOKEN_SECRET must be set to a random secret of at least 32 characters.');
  }
  return secret;
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) {
    throw new Error('Password must be between 10 and 200 characters.');
  }
  const salt = crypto.randomBytes(16);
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(key));
  });
  return `${salt.toString('hex')}:${Buffer.from(derived).toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [saltHex, hashHex] = stored.split(':');
  if (!/^[a-f0-9]{32}$/.test(saltHex || '') || !/^[a-f0-9]{128}$/.test(hashHex || '')) return false;
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), 64, (err, key) => err ? reject(err) : resolve(key));
  });
  return crypto.timingSafeEqual(Buffer.from(hashHex, 'hex'), Buffer.from(derived));
}

function b64url(value) {
  return Buffer.from(value).toString('base64url');
}

export function issueSessionToken(user, companyId, role) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: String(user._id),
    companyId: String(companyId),
    role,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID()
  };
  const encoded = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', tokenSecret()).update(encoded).digest('base64url');
  return { token: `${encoded}.${signature}`, expiresIn: TOKEN_TTL_SECONDS };
}

export function verifySessionToken(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const [payloadPart, signaturePart, extra] = token.split('.');
  if (!payloadPart || !signaturePart || extra) return null;
  const expected = crypto.createHmac('sha256', tokenSecret()).update(payloadPart).digest();
  let supplied;
  try { supplied = Buffer.from(signaturePart, 'base64url'); } catch { return null; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
    if (!payload.sub || !payload.companyId || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
