# Deployment checklist

- [ ] Push repository to GitHub; confirm `.env` and secrets are ignored.
- [ ] Create MongoDB Atlas database and set `MONGODB_URI`.
- [ ] Deploy the Render Blueprint from `render.yaml`.
- [ ] Set `ADMIN_API_TOKEN` (24+ characters) on the backend.
- [ ] Set and preserve `AI_SETTINGS_ENCRYPTION_KEY` (24+ characters) on the backend.
- [ ] Set PayPal Sandbox `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.
- [ ] Set `PUBLIC_API_URL`, `CLIENT_ORIGIN`, and frontend `VITE_API_URL` to the actual deployed URLs.
- [ ] Set `PAYPAL_WEBHOOK_ID` after creating the webhook.
- [ ] Open the frontend and connect through **AI Settings** with `ADMIN_API_TOKEN`.
- [ ] Test and save the selected AI provider/model/key.
- [ ] Check `/api/health` and verify database connectivity.
- [ ] Trigger a test SKU using Sandbox credentials; approve an Orders v2 payment with a Sandbox buyer.
- [ ] Confirm ledger status and webhook reconciliation.
- [ ] Confirm cold-start behavior and logs; do not claim production readiness from a successful demo run.
