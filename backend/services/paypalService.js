// File: backend/services/paypalService.js
/**
 * PayPal REST integration (Sandbox by default).
 *
 * WHY plain fetch instead of the legacy PayPal SDK: the Orders v2 / Payouts / Webhooks APIs are
 * simple JSON-over-HTTPS, Node 20 ships fetch, and avoiding a heavyweight SDK keeps the image
 * small and every request/response visible to reviewers.
 *
 * All env vars are read lazily (inside functions) so dotenv can load after ES-module imports.
 */

const apiBase = () => process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';

export class PayPalError extends Error {
  constructor(message, { status, debugId, details } = {}) {
    super(message);
    this.name = 'PayPalError';
    this.status = status;
    this.debugId = debugId; // quote this id to PayPal support
    this.details = details;
  }
}

// Money is handled in integer cents to avoid floating-point drift (0.1 + 0.2 problems).
const toCents = (n) => Math.round(Number(n) * 100);
const fromCents = (c) => (c / 100).toFixed(2); // PayPal wants decimal *strings*

async function timedFetch(url, options, ms = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctl.signal });
  } catch (err) {
    throw new PayPalError(err.name === 'AbortError' ? `PayPal request timed out after ${ms}ms` : `PayPal network error: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------ Authentication ------------------------------ */

let tokenCache = { token: null, expiresAt: 0 };
let tokenInflight = null;

/**
 * OAuth2 client-credentials. The token is cached (they live ~9h) and concurrent callers share one
 * in-flight request, so an agent burst never hammers /oauth2/token.
 */
export async function getAccessToken(force = false) {
  if (!force && tokenCache.token && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token;
  if (tokenInflight) return tokenInflight;

  tokenInflight = (async () => {
    const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
    if (!id || !secret) throw new PayPalError('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not configured');

    const res = await timedFetch(`${apiBase()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new PayPalError(`PayPal auth failed: ${data.error_description || res.statusText}`, {
        status: res.status,
        debugId: res.headers.get('paypal-debug-id'),
      });
    }
    tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return tokenCache.token;
  })().finally(() => {
    tokenInflight = null;
  });

  return tokenInflight;
}

/** Authenticated request helper with one automatic retry on 401 (expired/revoked token). */
async function paypalRequest(path, { method = 'GET', body, requestId, retry = true } = {}) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // PayPal-Request-Id = idempotency key: a retried call can never create a second payment.
  if (requestId) headers['PayPal-Request-Id'] = requestId;

  const res = await timedFetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

  if (res.status === 401 && retry) {
    await getAccessToken(true);
    return paypalRequest(path, { method, body, requestId, retry: false });
  }

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new PayPalError(`PayPal ${method} ${path} failed (${res.status}): ${data.message || data.name || res.statusText}`, {
      status: res.status,
      debugId: res.headers.get('paypal-debug-id'),
      details: data.details,
    });
  }
  return data;
}

/* ------------------------------- Orders API v2 ------------------------------ */

/**
 * Create a Sandbox Order that pays a supplier.
 * Orders need payer approval, which gives us a deliberate human-in-the-loop checkpoint: the AI
 * can *propose and stage* a payment but a person (or a pre-authorised buyer) releases the funds.
 * `custom_id` carries our Mongo _id so every webhook can be matched back to the ledger row.
 */
export async function createOrder({ requestId, customId, referenceId, vendorName, sku, quantity, unitPrice, currency = 'USD', payeeEmail }) {
  const unitCents = toCents(unitPrice);
  if (!Number.isInteger(quantity) || quantity < 1 || unitCents < 1) throw new PayPalError('Invalid order line item');

  const total = fromCents(unitCents * quantity);
  const publicApi = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 5000}`;

  const purchaseUnit = {
    reference_id: referenceId,
    custom_id: customId,
    description: `VendorMesh restock: ${quantity} x ${sku} from ${vendorName}`.slice(0, 127),
    amount: {
      currency_code: currency,
      value: total,
      breakdown: { item_total: { currency_code: currency, value: total } },
    },
    items: [
      {
        name: `${sku} restock`.slice(0, 127),
        sku,
        quantity: String(quantity),
        category: 'PHYSICAL_GOODS',
        unit_amount: { currency_code: currency, value: fromCents(unitCents) },
      },
    ],
  };
  if (payeeEmail) purchaseUnit.payee = { email_address: payeeEmail }; // route funds to the vendor's merchant account

  const order = await paypalRequest('/v2/checkout/orders', {
    method: 'POST',
    requestId,
    body: {
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: 'VendorMesh',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            payment_method_preference: 'IMMEDIATE_PAYMENT_REQUIRED',
            return_url: `${publicApi}/api/paypal/return`,
            cancel_url: `${publicApi}/api/paypal/cancel`,
          },
        },
      },
    },
  });

  return {
    id: order.id,
    status: order.status,
    approvalUrl: order.links?.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href,
  };
}

/** Capture an approved order (called when PayPal redirects the approver back to us). */
export async function captureOrder(orderId, requestId) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: 'POST', requestId });
}

/* -------------------------------- Payouts API ------------------------------- */

/**
 * Autonomous disbursement (no approval step) – used for trusted vendors that accept PayPal Payouts.
 * `items` supports many recipients, so the same call scales to true bulk supplier runs.
 */
export async function createPayout({ requestId, senderBatchId, items, emailSubject = 'Payment from VendorMesh' }) {
  const data = await paypalRequest('/v1/payments/payouts', {
    method: 'POST',
    requestId,
    body: {
      sender_batch_header: { sender_batch_id: senderBatchId, email_subject: emailSubject },
      items: items.map((i) => ({
        recipient_type: 'EMAIL',
        receiver: i.receiverEmail,
        sender_item_id: i.senderItemId,
        note: (i.note || 'Supplier payment').slice(0, 4000),
        amount: { currency: i.currency || 'USD', value: fromCents(toCents(i.amount)) },
      })),
    },
  });
  return { batchId: data.batch_header.payout_batch_id, status: data.batch_header.batch_status };
}

/* --------------------------------- Webhooks --------------------------------- */

/**
 * Verify a webhook really came from PayPal (otherwise anyone could POST "COMPLETED" to us).
 * We splice the *raw* request body into the verification payload: re-serialising parsed JSON can
 * change whitespace/number formatting and break the signature check.
 */
export async function verifyWebhookSignature(headers, rawBody) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    if (process.env.NODE_ENV === 'production') throw new PayPalError('PAYPAL_WEBHOOK_ID is required in production');
    console.warn('[paypal] PAYPAL_WEBHOOK_ID not set – skipping signature verification (development only)');
    return true;
  }
  const requiredHeaders = [
    'paypal-auth-algo',
    'paypal-cert-url',
    'paypal-transmission-id',
    'paypal-transmission-sig',
    'paypal-transmission-time',
  ];
  if (!rawBody || requiredHeaders.some((name) => typeof headers[name] !== 'string' || !headers[name])) return false;

  const q = (k) => JSON.stringify(headers[k]);
  const body =
    `{"auth_algo":${q('paypal-auth-algo')},"cert_url":${q('paypal-cert-url')},` +
    `"transmission_id":${q('paypal-transmission-id')},"transmission_sig":${q('paypal-transmission-sig')},` +
    `"transmission_time":${q('paypal-transmission-time')},"webhook_id":${JSON.stringify(webhookId)},` +
    `"webhook_event":${rawBody}}`;

  const result = await paypalRequest('/v1/notifications/verify-webhook-signature', { method: 'POST', body });
  return result.verification_status === 'SUCCESS';
}
