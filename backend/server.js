// File: backend/server.js
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import cron from 'node-cron';
import crypto from 'node:crypto';

import Transaction from './models/Transaction.js';
import User from './models/User.js';
import Company from './models/Company.js';
import { hashPassword, verifyPassword, issueSessionToken, verifySessionToken } from './services/authService.js';
import * as paypal from './services/paypalService.js';
import { runInventoryAgent, getInventory, getTreasury } from './services/agent.js';
import { getPublicAIConfig, saveAIConfig, testAIProvider } from './services/aiProvider.js';

// Load backend/.env first, then the repo-root .env (dotenv never overrides already-set vars).
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(here, '../.env') });

const PORT = Number(process.env.PORT) || 5000;
const ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim());
const CLIENT_URL = ORIGINS[0];

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors({ origin: ORIGINS }));
// Keep the raw bytes: PayPal's signature is computed over them (see verifyWebhookSignature).
app.use(express.json({ limit: '256kb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ------------------------------- Admin security ------------------------------- */

// The current hackathon build uses a single operator token rather than pretending to provide
// multi-user authentication. Never enable write routes publicly without setting this secret.
function hasValidAdminToken(req) {
  const expected = process.env.ADMIN_API_TOKEN || '';
  const supplied = req.get('x-admin-token') || '';
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function requireAdmin(req, res, next) {
  if (!hasValidAdminToken(req)) return res.status(401).json({ error: 'Admin token required. Set ADMIN_API_TOKEN on the server and enter it in the dashboard.' });
  return next();
}

/* ------------------------------ Account identity ------------------------------ */

function requireSession(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  let claims;
  try { claims = verifySessionToken(token); } catch (err) {
    return res.status(503).json({ error: err.message });
  }
  if (!claims) return res.status(401).json({ error: 'Sign in required or session expired.' });
  req.session = claims;
  return next();
}

function makeCompanySlug(name) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'workspace';
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

app.post('/api/auth/register', wrap(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  const companyName = typeof req.body?.companyName === 'string' ? req.body.companyName.trim() : '';
  if (name.length < 2 || name.length > 120) return res.status(400).json({ error: 'Enter your name (2–120 characters).' });
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (companyName.length < 2 || companyName.length > 120) return res.status(400).json({ error: 'Company name must be 2–120 characters.' });
  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await User.create({ name, email, passwordHash, memberships: [] });
    const company = await Company.create({ name: companyName, slug: makeCompanySlug(companyName), ownerUserId: user._id });
    user.memberships.push({ companyId: company._id, role: 'owner', status: 'active' });
    await user.save();
    const session = issueSessionToken(user, company._id, 'owner');
    return res.status(201).json({
      token: session.token, expiresIn: session.expiresIn,
      user: { id: String(user._id), name: user.name, email: user.email },
      company: { id: String(company._id), name: company.name, slug: company.slug, role: 'owner' }
    });
  } catch (err) {
    await User.deleteOne({ _id: user._id }).catch(() => {});
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
    throw err;
  }
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  const user = await User.findOne({ email, disabled: false }).select('+passwordHash');
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  const membership = user.memberships.find((m) => m.status === 'active');
  if (!membership) return res.status(403).json({ error: 'Your account has no active company workspace.' });
  const company = await Company.findById(membership.companyId).lean();
  if (!company) return res.status(403).json({ error: 'Your company workspace is unavailable.' });
  const session = issueSessionToken(user, company._id, membership.role);
  return res.json({
    token: session.token, expiresIn: session.expiresIn,
    user: { id: String(user._id), name: user.name, email: user.email },
    company: { id: String(company._id), name: company.name, slug: company.slug, role: membership.role }
  });
}));

app.get('/api/auth/me', requireSession, wrap(async (req, res) => {
  const user = await User.findById(req.session.sub).select('name email memberships').lean();
  if (!user) return res.status(401).json({ error: 'Session user is no longer available.' });
  const membership = user.memberships.find((m) => String(m.companyId) === String(req.session.companyId) && m.status === 'active');
  if (!membership) return res.status(403).json({ error: 'No active membership for this workspace.' });
  const company = await Company.findById(req.session.companyId).lean();
  if (!company) return res.status(401).json({ error: 'Session workspace is no longer available.' });
  return res.json({ user: { id: String(user._id), name: user.name, email: user.email }, company: { id: String(company._id), name: company.name, slug: company.slug, role: membership.role } });
}));

/* ---------------------------------- Read API --------------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1, time: new Date().toISOString() });
});

app.get('/api/transactions', wrap(async (_req, res) => {
  // Trace and webhook arrays are heavy; the grid only needs the summary fields.
  res.json(await Transaction.find().sort({ timestamp: -1 }).limit(200).select('-agent_trace -webhook_events').lean());
}));

app.get('/api/transactions/:id', wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
  const tx = await Transaction.findById(req.params.id).lean();
  return tx ? res.json(tx) : res.status(404).json({ error: 'Not found' });
}));

app.get('/api/treasury', wrap(async (_req, res) => res.json(await getTreasury())));
app.get('/api/inventory', (_req, res) => res.json(getInventory()));

/* ----------------------------- AI configuration ----------------------------- */

// API keys are encrypted at rest in MongoDB. They are never returned to the browser.
app.get('/api/ai/settings', requireAdmin, wrap(async (_req, res) => {
  res.json(await getPublicAIConfig());
}));

app.post('/api/ai/settings', requireAdmin, wrap(async (req, res) => {
  const { provider, model, apiKey } = req.body || {};
  res.json(await saveAIConfig({ provider, model, apiKey }));
}));

app.post('/api/ai/test', requireAdmin, wrap(async (req, res) => {
  const { provider, model, apiKey } = req.body || {};
  res.json(await testAIProvider({ provider, model, apiKey }));
}));

/* --------------------------- Core loop: trigger agent -------------------------- */

// Simulates a "Low Inventory Alert". Synchronous on purpose: the demo UI shows the outcome immediately.
app.post('/api/agent/trigger', requireAdmin, wrap(async (req, res) => {
  const { sku, on_hand } = req.body || {};
  if (typeof sku !== 'string' || !sku) return res.status(400).json({ error: 'sku (string) is required' });
  const override = on_hand === undefined ? undefined : Number(on_hand);
  if (override !== undefined && (!Number.isFinite(override) || override < 0)) return res.status(400).json({ error: 'on_hand must be a non-negative number' });

  const result = await runInventoryAgent({ sku, onHandOverride: override, trigger: 'rest' });
  res.status(201).json(result);
}));

/* ------------------------------ PayPal redirects ------------------------------ */

// Buyer approved the order in PayPal -> capture it, then bounce back to the dashboard.
app.get('/api/paypal/return', wrap(async (req, res) => {
  const orderId = String(req.query.token || '');
  const tx = orderId && (await Transaction.findOne({ paypal_order_id: orderId }));
  if (!tx) return res.redirect(`${CLIENT_URL}/?paypal=unknown_order`);

  try {
    const captured = await paypal.captureOrder(orderId, `${tx._id}-capture`);
    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0];
    tx.paypal_capture_id = capture?.id || tx.paypal_capture_id;
    // A synchronous COMPLETED capture is authoritative; the webhook later reconciles it idempotently
    // and is the only path for async outcomes (PENDING captures, denials, payout batches).
    if (captured.status === 'COMPLETED' && capture?.status === 'COMPLETED') tx.status = 'completed';
    await tx.save();
  } catch (err) {
    if (err.details?.[0]?.issue !== 'ORDER_ALREADY_CAPTURED') {
      tx.error_message = err.message.slice(0, 500);
      await tx.save();
      return res.redirect(`${CLIENT_URL}/?paypal=capture_failed`);
    }
  }
  res.redirect(`${CLIENT_URL}/?paypal=captured`);
}));

app.get('/api/paypal/cancel', (_req, res) => res.redirect(`${CLIENT_URL}/?paypal=cancelled`));

/* -------------------------------- PayPal webhook ------------------------------- */

/**
 * Maps a verified PayPal event to a ledger update. The `$ne` on webhook_events.event_id makes the
 * update atomic + idempotent: PayPal retries deliveries, and the same event can never apply twice.
 */
async function applyWebhookEvent(event) {
  const { id: eventId, event_type: type, resource = {} } = event;
  let filter;
  let status;
  const set = {};

  switch (type) {
    case 'PAYMENT.CAPTURE.COMPLETED':
    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED': {
      const orderId = resource.supplementary_data?.related_ids?.order_id;
      const or = [];
      if (orderId) or.push({ paypal_order_id: orderId });
      if (mongoose.isValidObjectId(resource.custom_id)) or.push({ _id: resource.custom_id });
      if (!or.length) return null;
      filter = { $or: or };
      status = type === 'PAYMENT.CAPTURE.COMPLETED' ? 'completed' : 'failed';
      set.paypal_capture_id = resource.id;
      break;
    }
    case 'PAYMENT.PAYOUTSBATCH.SUCCESS':
    case 'PAYMENT.PAYOUTSBATCH.DENIED':
      filter = { paypal_payout_batch_id: resource.batch_header?.payout_batch_id };
      status = type.endsWith('SUCCESS') ? 'completed' : 'failed';
      break;
    default:
      return null; // subscribed-but-unused events are acknowledged and ignored
  }

  // Never downgrade a settled payment because of a late/out-of-order failure event.
  if (status === 'failed') filter = { $and: [filter, { status: { $ne: 'completed' } }] };

  return Transaction.findOneAndUpdate(
    { ...filter, 'webhook_events.event_id': { $ne: eventId } },
    { $set: { ...set, status }, $push: { webhook_events: { event_id: eventId, event_type: type, received_at: new Date() } } },
    { new: true }
  );
}

app.post('/api/webhooks/paypal', async (req, res) => {
  try {
    if (!(await paypal.verifyWebhookSignature(req.headers, req.rawBody))) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    const tx = await applyWebhookEvent(req.body);
    console.log(`[webhook] ${req.body?.event_type} -> ${tx ? `tx ${tx._id} = ${tx.status}` : 'no ledger change'}`);
    return res.sendStatus(200);
  } catch (err) {
    console.error('[webhook] processing error:', err.message);
    return res.sendStatus(500); // non-2xx => PayPal retries with backoff, so no event is lost
  }
});

/* ---------------------------- Autonomous scheduler ---------------------------- */

// Cron = the "no human clicked anything" trigger. Skips SKUs that already have an open payment.
async function scanInventory() {
  for (const item of getInventory().filter((i) => i.below_reorder_point)) {
    const open = await Transaction.exists({ sku: item.sku, status: 'pending', timestamp: { $gt: new Date(Date.now() - 24 * 3600 * 1000) } });
    if (open) continue;
    try {
      await runInventoryAgent({ sku: item.sku, trigger: 'cron' });
    } catch (err) {
      console.error(`[cron] agent failed for ${item.sku}:`, err.message);
    }
  }
}

/* ----------------------------------- Errors ---------------------------------- */

app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

/* ------------------------------------ Boot ----------------------------------- */

async function main() {
  if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN.length < 24)) throw new Error('ADMIN_API_TOKEN must be set to at least 24 characters in production');
  if (process.env.NODE_ENV === 'production' && (!process.env.AI_SETTINGS_ENCRYPTION_KEY || process.env.AI_SETTINGS_ENCRYPTION_KEY.length < 24)) throw new Error('AI_SETTINGS_ENCRYPTION_KEY must be set to at least 24 characters in production');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  console.log('[db] connected to MongoDB');

  const server = app.listen(PORT, () => console.log(`[api] VendorMesh listening on :${PORT}`));

  if (process.env.ENABLE_CRON === 'true') {
    const schedule = process.env.AGENT_CRON_SCHEDULE || '*/10 * * * *';
    cron.schedule(schedule, () => scanInventory().catch((e) => console.error('[cron]', e.message)));
    console.log(`[cron] autonomous inventory scan enabled (${schedule})`);
  }

  const shutdown = (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(() => mongoose.connection.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[fatal]', err.message);
  process.exit(1);
});
