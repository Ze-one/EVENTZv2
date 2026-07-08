<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/086b7d3f-2e54-4972-b30c-e4f69ee0ef2c

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies:
   `npm install`
2. Copy [.env.example](.env.example) to `.env.local` and fill in your Supabase and SMTP values.
3. Run the app:
   `npm run dev`

## Deploy to Vercel

1. Push this repository to GitHub.
2. Create a Vercel project and connect it to the repository.
3. Add these environment variables in Vercel Project Settings -> Environment Variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SMTP_HOST` (optional)
   - `SMTP_PORT` (optional)
   - `SMTP_USER` (optional)
   - `SMTP_PASS` (optional)
   - `SMTP_FROM` (optional)
4. Deploy. The app will use Supabase when credentials are present, otherwise it falls back to the local JSON persistence layer.
