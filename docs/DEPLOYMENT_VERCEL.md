# Deploy VendorMesh frontend to Vercel

VendorMesh is a split application. Deploy the **React/Vite frontend** to Vercel and keep the current **Express/MongoDB backend** on Render (or another Node host). Do not deploy the repository root as a static Vercel site and expect the Express server, MongoDB connection, PayPal webhook handler, or scheduled task to run there.

Vercel's Hobby plan is free for personal, non-commercial projects. Check the current plan terms before using Hobby for a commercial service: https://vercel.com/docs/plans/hobby.

## 1. Deploy the backend first

1. Open the repository in Render and create a Blueprint from `render.yaml`, or use the existing Render service if already deployed.
2. Create/select a MongoDB Atlas database and configure `MONGODB_URI` in Render.
3. Set the required backend secrets in Render's Environment page:
   - `AUTH_TOKEN_SECRET`: random secret, at least 32 characters.
   - `ADMIN_API_TOKEN`: unique random token, at least 24 characters.
   - `AI_SETTINGS_ENCRYPTION_KEY`: unique random secret, at least 24 characters. Preserve it: changing it without re-encrypting saved credentials makes those credentials unreadable.
   - `MONGODB_URI`: database connection string.
   - `CLIENT_ORIGIN`: the exact Vercel production origin, for example `https://your-project.vercel.app`. Comma-separate additional trusted custom domains or stable preview origins if needed.
   - `PUBLIC_API_URL`: the actual public Render API URL.
4. Only configure PayPal variables when testing the PayPal flow. Use Sandbox credentials and `PAYPAL_API_BASE=https://api-m.sandbox.paypal.com` first. Never paste secrets into source files or Vercel frontend variables.
5. Wait for the backend service to start, then open `https://YOUR-API.onrender.com/health/live` and `/health/ready`. The second endpoint should report HTTP 200 and `database: "connected"` when MongoDB is reachable.

Do not assume the sample `vendormesh-api.onrender.com` hostname is your real deployment URL; use the URL shown by Render.

## 2. Import the repository in Vercel

1. Open https://vercel.com/new and import `PratoolGit/VendorMesh`.
2. In the project setup screen, set **Root Directory** to `frontend`.
3. Select **Vite** as the framework preset.
4. Use these build settings (Vercel may auto-detect them):
   - Install command: `npm install`
   - Build command: `npm run build`
   - Output directory: `dist`
5. Add the environment variable `VITE_API_URL` for **Production** and **Preview** as appropriate. Its value must be the public backend origin only, with no trailing slash or `/api` suffix, for example `https://YOUR-API.onrender.com`.
6. Click **Deploy**.

`VITE_API_URL` is baked into the frontend at build time. After changing it in Vercel, redeploy the project. Only public, non-secret values belong in variables prefixed with `VITE_`; never put `ADMIN_API_TOKEN`, PayPal secrets, MongoDB credentials, or AI keys in Vercel frontend variables.

Official Vercel documentation:
- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/environment-variables

## 3. Connect backend CORS to Vercel

After the first deployment, copy the exact production URL that Vercel assigned and update Render's `CLIENT_ORIGIN` to that origin (scheme + hostname, no trailing slash). If you use a custom domain, include it as an additional comma-separated origin. Save and redeploy/restart the backend so the CORS configuration is reloaded.

The backend's CORS allowlist is controlled by `CLIENT_ORIGIN`. A frontend can build successfully while every API request fails if this value does not match the browser's actual origin.

## 4. Smoke-test the live site

1. Open the Vercel production URL and create a test workspace with synthetic data.
2. Add an inventory item and an active supplier.
3. Create a purchase request and verify it appears as pending approval.
4. Test the pricing lab and confirm it only returns estimates; it must not change real prices.
5. Verify that a request from one workspace cannot access another workspace's records.
6. Check browser DevTools Network/Console for CORS, mixed-content, and API errors.
7. Re-check both backend health endpoints and Render logs.

Use test accounts and non-sensitive records first. This repository still has a separate legacy operator-token API for the experimental AI/treasury/PayPal workflows; do not expose its admin token to the browser. AI configuration is not yet a tenant-scoped setting in the workspace UI, and the legacy demo catalog and treasury values are not live ERP/bank data.

## Troubleshooting

- **Vercel page loads but API calls fail:** verify `VITE_API_URL` is set to the Render API origin and redeploy.
- **CORS error:** add the exact Vercel origin to Render's comma-separated `CLIENT_ORIGIN` and restart the backend.
- **`/health/live` works but `/health/ready` fails:** check `MONGODB_URI`, Atlas network access, database credentials, and Render logs.
- **First API request is slow:** a free backend instance may cold-start or sleep according to the host's current free-tier behavior.
- **AI or PayPal workflows fail:** verify backend-only provider/payment credentials and Sandbox eligibility. Do not put secrets into `VITE_*` variables.
- **Preview URL changes:** preview builds may have different origins; prefer a stable custom domain for repeatable authenticated testing and carefully add only origins you trust.
