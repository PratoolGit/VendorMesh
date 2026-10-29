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
