# VendorMesh

**VendorMesh is a procurement and inventory workspace with a separate experimental treasury/payment agent.** The workspace UI supports account registration, workspace-scoped inventory and suppliers, purchase requests and approvals, ordered/partial/complete receipt tracking, audit history, transparent daily-demand inventory forecasts, read-only procurement review signals, advisory pricing scenarios, an owner/admin-only AI copilot with per-workspace credentials and usage limits, and read-only scoped API keys for external reporting. Legacy treasury/payment endpoints still use a separate operator-token API.

## Site

**Live site:** [Open VendorMesh](https://YOUR-VERCEL-DEPLOYMENT-URL)

Replace the placeholder above with the Production Domain Vercel assigns after the first deployment. A verified live-site URL is not available yet.

> **Hackathon/demo status:** Inventory and supplier quotes are simulated in this repository. PayPal and AI calls are real integrations when configured, but no live supplier/ERP integration is included. Start with PayPal Sandbox. Do not use real money until you have reviewed and secured the application.

## What it does

- **AI procurement agent:** uses Anthropic Claude, OpenAI, or Google Gemini with tool calling to compare supplier quotes and choose a purchase or hold.
- **Workspace AI copilot:** owners/admins can configure a provider credential per workspace, test it, ask advisory procurement questions, and inspect usage metadata. A daily request limit applies; provider pricing/billing is still controlled by the provider.
- **Legacy AI provider adapter:** the older Anthropic/OpenAI/Gemini endpoints remain protected by the shared operator token and use a separate global configuration.
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
- Workspace routes use bearer-session authentication and membership roles; separate legacy transaction, treasury, agent, and AI-settings routes still use a shared operator token. These are separate security surfaces and are not a production-ready unified control plane.
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

7. Open `http://localhost:5173` and create a test workspace. The workspace dashboard uses email/password registration and sign-in.
8. Add synthetic inventory and supplier records, then test purchase requests, approvals, audit history, and the pricing lab.
9. The older AI/treasury/PayPal APIs use `X-Admin-Token` and are not wired into the current workspace UI. Do not expose `ADMIN_API_TOKEN` to frontend code or use the financial demo with real money.

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
6. In the current workspace dashboard, open **AI copilot**, configure a provider credential for that workspace, test it, save it, and ask an advisory procurement question. The legacy AI/treasury API remains separate and uses `X-Admin-Token`.
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
- The workspace AI copilot uses per-company encrypted credentials and a MongoDB-backed per-company daily request counter; its usage log stores metadata/token counts but not prompts or answers. The legacy `/api/ai/*` routes still use a separate global configuration protected by `ADMIN_API_TOKEN`. Authentication throttling is in-memory per process, so use shared infrastructure before scaling. A production financial deployment still needs a focused security review, payment approval review, monitoring, and validated recovery procedures.
- Real payment execution is irreversible in some cases. Keep the system in Sandbox until guardrails, approvals, webhook handling and business policy have been independently reviewed.

## Team

- Pratool Kumar Ray
- Ishan Roy

## License

MIT. See [LICENSE](LICENSE).


## Current workspace scope and known gaps

- Inventory, supplier, purchase-request, approval, team membership, audit-log, and pricing routes are implemented in the workspace API and scoped by the active company in the inspected code. Continue to run the tests and verify authorization before relying on them with real data.
- Inventory and supplier records entered in a workspace are stored in MongoDB. The separate legacy agent catalog and treasury starting balance are demonstration/policy data, not live supplier or bank integrations.
- The legacy `/api/ai/*`, `/api/transactions`, `/api/treasury`, and `/api/agent/*` routes still use `ADMIN_API_TOKEN`; saved AI provider settings are global rather than company-specific. They must not be exposed as ordinary workspace settings.
- The audit log's application-level guards are not a substitute for database-level insert-only credentials, retention controls, or an external tamper-resistant archive.
- Authentication throttling currently uses in-memory per-process buckets. If the API is scaled to multiple instances, use a shared rate-limit store or edge protection.
- Keep multi-instance rate limits in a shared store or enforce them at a trusted edge before scaling the API.

- The review queue checks recent workspace purchase requests for possible duplicates, totals that do not reconcile, inactive/missing references, incomplete review metadata, and amounts over the configured limit. These are rule-based review signals, not fraud findings.

## API documentation

- [Workspace API OpenAPI specification](docs/openapi.yaml)
- [Postman collection](postman/VendorMesh.postman_collection.json) — includes the existing legacy operator routes and a workspace Bearer-session folder. Use synthetic test data and a unique test email.

The OpenAPI file covers the workspace session API and the separate read-only `/api/v1` inventory, supplier and purchase-request endpoints. Public API write scopes and financial actions are intentionally not available.

- AI quota configuration: `AI_MAX_REQUESTS_PER_DAY` defaults to 25 provider tests/advisory questions per workspace UTC day; accepted values are 1–500. This limits app requests, not the provider's price or billing plan. Token counts are displayed only when the provider returns usage metadata.

- OpenAPI and Postman now also cover the owner/admin-only workspace AI settings, credential test, usage, and advisory ask endpoints. The sample Postman AI key variable is blank; only set it in your private local environment, not in a shared collection.


## Read-only public API v1

Workspace owners/admins can create scoped API tokens under **API access**. The full token is shown only at creation time; it is stored as a SHA-256 hash and can be revoked or allowed to expire (1–365 days). Put the token in your integration's secret manager, never in a frontend bundle or public repository.

Send it as a bearer token:

```http
Authorization: Bearer vmk_<key-id>.<secret>
```

Supported endpoints:

- `GET /api/v1/inventory?limit=50&lowStock=true`
- `GET /api/v1/suppliers?limit=50&active=true`
- `GET /api/v1/purchase-requests?limit=50&status=pending`

Responses use `data`, `limit`, and `nextCursor`. Pass the returned cursor as `after` to fetch the next page. Limits are 1–100 records per page. Scopes are `inventory:read`, `suppliers:read`, and `purchasing:read`; API keys cannot write records, approve purchases, or initiate payments. The current rate limiter is process-local and must be replaced with shared/edge enforcement before multi-instance scaling.

- **Invoice register and reconciliation:** manually capture invoice headers against approved/fulfilled purchase requests, review invoices with discrepancy notes, and view read-only reconciliation signals. Upload/OCR and settlement-ledger reconciliation are not enabled in this release.

- Invoice API workflows are documented in OpenAPI and Postman: manually record invoices against approved/fulfilled requests, review them as owner/admin, and run read-only reconciliation. Use test records only; invoice approval does not trigger payment.
