<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# EVENTZv2 — ETSNTECH Event Access Pass System

This app manages event participants, generates QR-code entrance passes, emails passes directly to participants, and verifies passes at the gate.

View your app in AI Studio: https://ai.studio/apps/086b7d3f-2e54-4972-b30c-e4f69ee0ef2c

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and fill in your Supabase and email delivery values.
3. Run the app:
   `npm run dev`

## Deploy to Vercel

1. Push this repository to GitHub.
2. Create a Vercel project and connect it to the repository.
3. Add these environment variables in Vercel Project Settings -> Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_BASE_URL` — your deployed app URL, for example `https://your-app.vercel.app`
   - `SENDGRID_API_KEY` — recommended for real email delivery on Vercel
   - `SENDGRID_FROM` — verified SendGrid sender, for example `"ETS N-TECH" <verified_sender@yourdomain.com>`

   Optional SMTP fallback if you are not using SendGrid:
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `SMTP_FROM`
4. Deploy.

## Email pass delivery

The app now uses dedicated Vercel API handlers for:

- `POST /api/participants/:id/email`
- `POST /api/participants/bulk-email`

These handlers do real delivery only. If SendGrid or SMTP is not configured, the API returns a clear error instead of pretending the pass was delivered.

For SendGrid, make sure:

1. `SENDGRID_API_KEY` is added in Vercel.
2. `SENDGRID_FROM` uses a sender verified inside SendGrid.
3. `APP_BASE_URL` points to the live deployed app so the QR code opens the correct `/verify/:passId` page.
4. After adding or changing environment variables, redeploy the Vercel project.

The app will use Supabase when credentials are present. Supabase is strongly recommended for production so participant, scan, and email logs persist correctly.
