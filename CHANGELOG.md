# Changelog

## VendorMesh integration update

- Added an operator-facing AI provider settings panel to the dashboard.
- Added a normalized tool-calling adapter for Anthropic, OpenAI Chat Completions, and Google Gemini.
- Added protected API routes to inspect provider status, test credentials without saving them, and save provider configuration.
- Added AES-256-GCM encryption for saved AI provider keys in MongoDB.
- Added `ADMIN_API_TOKEN` protection to AI settings and payment-trigger routes.
- Added production startup checks for operator-token and encryption-key configuration.
- Added safer response headers and stricter PayPal webhook header validation.
- Added backend test scaffolding, GitHub Actions CI, deployment checklist, architecture notes, MIT license, and Postman collection.
- Updated README and Render Blueprint for the revised environment-variable flow.

## Existing functionality retained

- React/Vite dashboard and AG Grid ledger.
- MongoDB transaction ledger and treasury policy calculation.
- PayPal Orders v2, optional Payouts, webhook reconciliation and approval redirect.
- Simulated inventory and supplier quote demo data.
- Optional scheduled inventory scanning (disabled by default).
