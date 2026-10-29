# EVENTZ — find your people, make a moment

EVENTZ brings public event discovery and registration together with an organizer workspace for passes, participants, gate access, and attendance reports. One account can attend events and organize its own.

## Develop locally

Use Node.js **22 or newer** (validated with Node 24). From the existing checkout:

```bash
npm ci
npm run dev
```

The public discovery page is served on port 3000. There are no invented public events: create an account, choose **Create an event**, save a draft, and publish it to populate discovery. The older demonstration event remains a private draft owned by the original demo administrator. Existing participant records are preserved; they are not automatically linked to new accounts by matching email.

No external credentials are needed locally. The JSON store is `db.json` (ignored by Git). Development signing keys are generated in memory unless you supply your own. Downloaded QR codes and sessions created with these ephemeral keys stop working after a server restart; open your ticket again to get a fresh QR. **Do not copy placeholder credentials from `.env.example`.**

```bash
npm run lint
npm test
npm run build
```

`npm test` uses a temporary database and a local HTTP server. It checks account security, publication, event ownership, cross-event isolation, registrations and capacity, saved events, follows, private QR passes, cancellation, gate permissions, and persistence. It never writes to your development database or contacts Supabase. The build generates both the frontend and `dist/server.mjs`.

## What is included

- Public discovery with search, category, city, and date filters; event and organizer pages.
- Account creation and sign-in, public profiles, saved events, and organizer follows.
- Multiple events per organizer, drafts and private previews, publishing, editing, cancellation, capacity, and registration deadlines.
- Free registration, a personal ticket wallet, signed QR downloads, and cancellation. Duplicate registration requests return the same pass; cancelling invalidates the previous QR.
- The existing organizer workspace, now authorized and scoped to the selected event: participant management, pass design, online registration records, QR generation, scanner, scan history, exports, and gate staff assignments.
- Event-specific offline gate manifests and queues. Gate staff can access only assigned events; removing an assignment preserves the person's account.

Registrations in this release are confirmed immediately. Paid tickets, waitlists, manual registration approval, comments, direct messages, notifications/reminder delivery, password recovery, and email verification are future work. In-app passes work without an email provider. Optional existing email delivery requires Brevo or SMTP; its legacy RSVP links are not a supported platform workflow yet.

## Brand identity

The supplied EVENTZ logo is used intact in the public header, footer, ticket wallet and existing organizer workspace. The platform palette uses navy `#0e1b3b`, gold `#f5aa0d`, blue `#1d4c84`, and white. `src/platform/BrandLogo.tsx` reuses `public/assets/eventz-official-logo.png`; `src/platform/platform.css` defines the responsive layout, typography and event-card treatments. New events use the same navy and gold as their initial pass colors; existing customized pass designs are preserved.

## Data and authorization

The Express gateway owns authentication and authorization. New passwords use salted scrypt; existing SHA-256 password records remain readable for compatibility. Sessions are signed, and ownership is checked on the server for every workspace request. Caller-supplied roles, owner IDs, and event IDs cannot grant access to someone else's data.

Public event/profile responses exclude email addresses, password hashes, attendee lists, gate assignments, and users' saved/follow lists. Online meeting URLs are provided through authenticated registrations rather than public discovery. The account endpoint returns the signed-in account's own private preferences.

Management APIs use `/api/workspace/:eventId/...`. Unscoped legacy routes are closed; direct Vercel function entrypoints also reject requests without the authorized event context. `vercel.json` routes APIs through the same gateway.

JSON storage supports a **single server process** for local development or a durable-volume deployment. Writes replace the file atomically, and local event writes are serialized. Do not run multiple JSON-backed workers against the same file. Supabase is the production option for multiple server instances: registration uses a row-locking SQL transaction, and gate claims use conditional updates to prevent duplicate acceptance.

## Supabase and production

For a new database, apply `supabase-schema.sql`, then `migrations/20261029_event_platform.sql` in the Supabase SQL editor as the database owner. For an existing installation, review and apply the migration after backing up the database. It adds ownership, publication, account preferences, registration fields, and pass lifecycle tables. It also restricts direct browser access to application tables; application access must go through the server.

The migration preserves `event-1` under `user-admin` only when that account exists. Other legacy events need an explicitly assigned owner before they can be managed or published. Resolve pre-existing case-insensitive duplicate user emails before creating the new email index; the migration fails rather than deleting accounts or registrations.

Configure actual values securely in the deployment settings:

- `SUPABASE_URL` and **`SUPABASE_SERVICE_ROLE_KEY`** — server-side only; an anonymous key is not sufficient for application data access.
- `EVENTZ_SESSION_SECRET` and `PASS_QR_SIGNING_SECRET` — distinct, stable, high-entropy keys. Generate them with a cryptographically secure generator; never expose them to the frontend or commit them.
- `APP_BASE_URL` — the public HTTPS origin used in pass links.

For a conventional Node server, build and run `npm start` with these variables. A JSON-backed production server must explicitly configure `EVENTZ_DB_FILE` on a durable volume; Vercel requires Supabase. Keep the production keys stable across instances. TLS termination and deployment-level rate limiting should be configured at the host; the API includes a bounded in-process sign-in guard.

The Supabase schema and live provider integration require validation against your own project before production rollout; local validation does not establish that an existing remote database has been migrated. New production databases start without demo accounts. Review any demo accounts carried over from an older installation before exposing it publicly. Supabase demo seeding is disabled by default. Set `EVENTZ_SEED_DEMO=true` only for a deliberately disposable database, never a production project.

Supabase Storage dashboard media remains optional and requires the `eventz-media` bucket and its storage setup. Media is stored under an event-specific path. Optional email uses `BREVO_API_KEY` and a verified `BREVO_FROM`, or the SMTP variables described in `.env.example`. Sending mail, uploading remote media, and applying database migrations are separate external actions; development tests do not perform them.
