# VendorMesh architecture notes

## Trust boundaries

1. The browser never receives saved provider API keys.
2. The operator must supply `X-Admin-Token` to AI configuration routes and the payment-trigger route.
3. Saved AI keys are encrypted with AES-256-GCM. The encryption key is derived from `AI_SETTINGS_ENCRYPTION_KEY`, which must remain stable.
4. PayPal calls happen only in the backend.
5. Payment tools re-check quote provenance, amount cap, spendable cash, reserve and rail eligibility before calling PayPal.
6. PayPal webhooks must pass PayPal's signature verification in production and supported event IDs are tracked to avoid duplicate application.

## Current implementation boundary

The demo's inventory and supplier quotes are generated from static arrays in `backend/services/agent.js`. The ledger-derived treasury is a simulated policy balance. To connect live suppliers, replace `getInventory()` and `buildQuotes()` with authenticated supplier/ERP adapters and retain the backend-side validation checks.

## AI provider adapter

`backend/services/aiProvider.js` translates the agent's normalized tool-call loop into the Anthropic Messages API, OpenAI Chat Completions function calling, or Gemini `generateContent` function calling. The agent itself keeps one provider-neutral tool contract.

## Before production

- Add full user authentication, role-based access control and per-tenant secrets.
- Add CSRF protections appropriate to the chosen auth mechanism, rate limits, monitoring and alerting.
- Use a proper supplier directory and verify payee identity independently.
- Require human approval for real-money payments; set separate policies for order creation and payout release.
- Add integration tests against PayPal Sandbox, replay protection tests, database migrations and dependency/security scanning.
