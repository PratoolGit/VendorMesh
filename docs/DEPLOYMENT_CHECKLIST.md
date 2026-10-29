# Deployment checklist

- [ ] Push repository to GitHub; confirm `.env` and secrets are ignored.
- [ ] Create MongoDB Atlas database and set `MONGODB_URI`.
- [ ] Deploy the Render Blueprint from `render.yaml`.
- [ ] Set `ADMIN_API_TOKEN` (24+ characters) on the backend.
- [ ] Set and preserve `AI_SETTINGS_ENCRYPTION_KEY` (24+ characters) on the backend.
- [ ] Set PayPal Sandbox `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
- [ ] Set `PUBLIC_API_URL` and `CLIENT_ORIGIN` on the backend to the actual deployed URLs.
- [ ] If the frontend is hosted on Vercel, set `VITE_API_URL` in Vercel to the public backend origin, then redeploy the frontend.
- [ ] If using Vercel, allowlist the exact Vercel production/custom domain in the backend `CLIENT_ORIGIN` value.
- [ ] Set `PAYPAL_WEBHOOK_ID` after creating the webhook.
- [ ] Use the current workspace registration/sign-in UI to smoke-test tenant-scoped inventory and purchasing flows.
- [ ] Treat AI settings and treasury/PayPal agent routes as a separate legacy operator-token API; they are not wired into the workspace UI and must not expose the admin token to the browser.
- [ ] Check `/api/health` and verify database connectivity.
- [ ] Trigger a test SKU using Sandbox credentials; approve an Orders v2 payment with a Sandbox buyer.
- [ ] Confirm ledger status and webhook reconciliation.
- [ ] Confirm cold-start behavior and logs; do not claim production readiness from a successful demo run.
