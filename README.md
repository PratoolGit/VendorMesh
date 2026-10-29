# VendorMesh

**An AI-assisted procurement and liquidity control demo built around PayPal.** VendorMesh watches inventory signals, compares supplier quotes, applies deterministic cash guardrails, and stages or sends PayPal payments while recording an explainable transaction ledger.

> **Hackathon/demo status:** Inventory and supplier quotes are simulated in this repository. PayPal and AI calls are real integrations when configured, but no live supplier/ERP integration is included. Start with PayPal Sandbox. Do not use real money until you have reviewed and secured the application.

## What it does

- **AI procurement agent:** uses Anthropic Claude, OpenAI, or Google Gemini with tool calling to compare supplier quotes and choose a purchase or hold.
- **Provider settings UI:** change provider/model, test a key, and save settings from the dashboard.
- **Encrypted provider keys:** saved AI keys are encrypted with AES-256-GCM before being written to MongoDB; keys are never returned to the frontend.
- **Deterministic payment guardrails:** the model cannot invent a supplier quote, bypass the cash reserve, exceed the configured single-payment limit, or use a payout rail for an ineligible vendor.
- **PayPal Orders v2:** stages an order that requires human approval before capture.
- **PayPal Payouts:** optional payout rail for the demo vendor marked as eligible; requires PayPal Payouts access and a configured recipient.
- **Webhook reconciliation:** verifies PayPal webhook signatures in production and applies supported event IDs idempotently.
- **Transaction ledger:** MongoDB/Mongoose records decisions, payment status, reasoning and tool traces.
- **Treasury dashboard:** displays committed, reserve and spendable cash.
- **AG Grid transaction log:** sortable/filterable transaction history.
- **Optional scheduled inventory scan:** disabled by default.
- **Docker Compose and Render Blueprint:** local stack and cloud deployment starting points.

## Important limitations

- The product inventory and vendor quote catalog in `backend/services/agent.js` are hard-coded demo data. They are **not** a live supplier API.
- The treasury balance is a policy simulation derived from the MongoDB ledger, not a live bank balance.
- Vendor recipient routing is a demo configuration; do not assume the single `PAYPAL_VENDOR_PAYEE_EMAIL` value is a production supplier directory.
- The included operator token is a single-admin gate for write/settings endpoints, not user accounts, roles, or a complete identity system.
- Payouts require PayPal account capability and may not be enabled for every Sandbox account.
- A public demo should use sandbox credentials and synthetic data. A production financial app needs a security review, stronger identity/access controls, audit retention, monitoring, and explicit payment approvals.

## Architecture

```text
React + Vite + AG Grid
    │ HTTPS / X-Admin-Token for operator actions
    ▼
Express API ────────────── MongoDB
    │                         ├─ Transaction ledger
    │                         └─ Encrypted AI provider settings
    ├─ AI provider adapter ── Anthropic / OpenAI / Gemini
    └─ PayPal REST API ────── Orders v2 / Payouts / Webhook verification
```

The model proposes a supplier action; backend code validates the quote and treasury policy before calling PayPal. The ledger row is created before the PayPal request and its ID is used as an idempotency/reference value.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB 7 locally, or a MongoDB Atlas connection string
- PayPal Developer Sandbox REST app credentials
- One AI provider API key (Anthropic, OpenAI, or Gemini) for agent runs

## Quick start: local

1. Clone/download this repository and open a terminal in the repository root.
2. Create a root `.env` file:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell, use `Copy-Item .env.example .env`.

3. Replace `ADMIN_API_TOKEN` and `AI_SETTINGS_ENCRYPTION_KEY` with strong random secrets. Keep `AI_SETTINGS_ENCRYPTION_KEY` stable across restarts/deploys or saved keys cannot be decrypted. Never commit `.env`.
4. Start MongoDB locally, or set `MONGODB_URI` to your MongoDB Atlas database.
5. Start the backend:

   ```bash
   cd backend
   npm install
   npm run dev
   ```

6. In a second terminal, start the frontend:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

7. Open `http://localhost:5173`. Click **AI Settings**, enter the same `ADMIN_API_TOKEN` as your backend, and click **Connect to backend**.
8. Select a provider, enter the model ID and API key, click **Test connection**, then **Save provider**.
9. Use **Send low-stock alert** to run the agent. Use only PayPal Sandbox credentials while testing.

The Vite development server proxies `/api` to `http://localhost:5000`.

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `ADMIN_API_TOKEN` | Yes in production | Protects AI settings and the payment-trigger endpoint. Use a unique random secret of 24+ characters. |
| `AI_SETTINGS_ENCRYPTION_KEY` | Yes to save settings; required in production | Stable secret used to derive the AES-256-GCM encryption key for saved provider credentials. |
| `PAYPAL_CLIENT_ID` | For PayPal calls | PayPal REST app client ID |
| `PAYPAL_CLIENT_SECRET` | For PayPal calls | PayPal REST app secret |
| `PAYPAL_API_BASE` | No | Sandbox by default: `https://api-m.sandbox.paypal.com` |
| `PAYPAL_WEBHOOK_ID` | Required in production | Webhook ID from the PayPal Developer Dashboard |
| `PAYPAL_VENDOR_PAYEE_EMAIL` | For Payouts / payee routing | Sandbox vendor/business account email used by this demo |
| `ANTHROPIC_API_KEY` | Optional legacy fallback | Used only when no AI settings record has been saved |
| `ANTHROPIC_MODEL` | Optional | Model for the legacy Anthropic environment fallback |
| `PORT` | No | Backend port; default `5000` |
| `NODE_ENV` | No | Set `production` when deployed |
| `CLIENT_ORIGIN` | Yes for split hosting | Comma-separated allowed frontend origins |
| `PUBLIC_API_URL` | Yes for PayPal redirect | Public backend URL, e.g. `https://your-api.onrender.com` |
| `INITIAL_BANK_BALANCE` | No | Demo starting cash; default `25000` |
| `MIN_CASH_RESERVE` | No | Protected reserve; default `5000` |
| `MAX_SINGLE_PAYMENT` | No | Per-payment cap; default `15000` |
| `ENABLE_CRON` | No | Set `true` to enable periodic inventory scan; default `false` |
| `AGENT_CRON_SCHEDULE` | No | Cron expression; default `*/10 * * * *` |

## PayPal Sandbox setup

1. In the PayPal Developer Dashboard, create a **Sandbox REST app** and copy its client ID and secret into `.env` or your hosting provider's environment settings.
2. Keep `PAYPAL_API_BASE=https://api-m.sandbox.paypal.com`.
3. Create/identify a Sandbox business account for the demo payee and set `PAYPAL_VENDOR_PAYEE_EMAIL` if needed.
4. Deploy the backend or expose local development with a secure temporary tunnel before creating a webhook.
5. Register a webhook at `https://YOUR_API_HOST/api/webhooks/paypal` and subscribe to the supported capture/payout events, including `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.PAYOUTSBATCH.SUCCESS`, and `PAYMENT.PAYOUTSBATCH.DENIED`.
6. Put the webhook ID in `PAYPAL_WEBHOOK_ID`. In production, signature verification is mandatory; do not omit this value.
7. Trigger a restock. For an Orders v2 transaction, open **Approve in PayPal**, approve with a Sandbox personal account, and confirm that the ledger status updates.

Payouts may require additional PayPal account permissions. If unavailable, use the Orders v2 approval flow.

## Deploy to Render

The included `render.yaml` is a Blueprint starting point. Review service names/URLs and environment variables before deploying.

1. Push this repository to a GitHub repository.
2. Create a MongoDB Atlas database and configure its connection string as `MONGODB_URI` in the Render API service.
3. In Render, choose **New → Blueprint** and select the repository containing `render.yaml`.
4. Set these secrets on the API service: `ADMIN_API_TOKEN`, `AI_SETTINGS_ENCRYPTION_KEY`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET`. Add `PAYPAL_VENDOR_PAYEE_EMAIL` if you intend to test Payouts.
5. Verify the backend's `PUBLIC_API_URL` and `CLIENT_ORIGIN` match the actual service URLs. Verify frontend `VITE_API_URL` points to the API URL.
6. Open the frontend, click **AI Settings**, enter `ADMIN_API_TOKEN`, connect, then save and test your provider key.
7. Register the PayPal webhook against the deployed API URL, then add its generated ID as `PAYPAL_WEBHOOK_ID` on the API service and redeploy/restart.
8. Test `/api/health`, read-only dashboard loading, AI connection testing, a Sandbox order approval, and webhook status reconciliation before recording a demo.

**Free-tier caveat:** Render free web services may sleep when idle, and cold starts can delay requests. MongoDB Atlas access/network rules must permit the deployed API. Never put secret API keys in `VITE_*` variables because frontend build variables are public.

## Docker Compose

```bash
cp .env.example .env
# Edit .env with your MongoDB, operator and Sandbox settings.
docker compose up --build
```

- Dashboard: `http://localhost:3000`
- API health: `http://localhost:5000/api/health`

The Compose stack starts a local MongoDB container and persists its data in a named volume. The frontend container uses Nginx to proxy `/api` requests to the backend.

## API reference

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | API and DB liveness |
| `GET` | `/api/transactions` | Public read | Latest 200 ledger rows |
| `GET` | `/api/transactions/:id` | Public read | Full ledger row including agent trace |
| `GET` | `/api/treasury` | Public read | Cash policy summary |
| `GET` | `/api/inventory` | Public read | Simulated inventory catalog |
| `GET` | `/api/ai/settings` | Admin token | Provider/model and key-configured status; never returns the key |
| `POST` | `/api/ai/test` | Admin token | Tests provider credentials without persisting them |
| `POST` | `/api/ai/settings` | Admin token | Encrypts and saves provider/model/key |
| `POST` | `/api/agent/trigger` | Admin token | Runs agent for `{ "sku": "GAN-100W" }` |
| `GET` | `/api/paypal/return` | PayPal redirect | Captures an approved order and redirects to dashboard |
| `POST` | `/api/webhooks/paypal` | PayPal signature | Verifies and reconciles supported PayPal events |

## Tests and validation

```bash
cd backend
npm install
npm test
```

The backend source is ES modules and targets Node 20+. For the frontend:

```bash
cd frontend
npm install
npm run build
```

## Partner technologies

- **PayPal Developer / REST APIs:** Sandbox Orders v2, optional Payouts, and webhook signature verification.
- **AG Grid Community:** transaction ledger table.
- **Render:** deployment Blueprint.
- **MongoDB Atlas / Mongoose:** persistent ledger and encrypted provider configuration.
- **Postman:** a starter collection is bundled at `postman/VendorMesh.postman_collection.json` for manual API checks.

## Security notes

- Do not commit `.env`, real API keys, PayPal secrets, or production database credentials.
- Keep `ADMIN_API_TOKEN` and `AI_SETTINGS_ENCRYPTION_KEY` separate and private. Rotating the encryption key without re-encrypting stored settings makes old saved keys unreadable.
- Use HTTPS in hosted environments. The provider API key is sent to your backend, not stored in browser storage.
- This build's operator-token design is a demo-level gate, not full authentication or per-user authorization. Do not expose it as a production financial operations platform without a security review.
- Real payment execution is irreversible in some cases. Keep the system in Sandbox until guardrails, approvals, webhook handling and business policy have been independently reviewed.

## Team

- Pratool Kumar Ray
- Ishan Roy

## License

MIT. See [LICENSE](LICENSE).
