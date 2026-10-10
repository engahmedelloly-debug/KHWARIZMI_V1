# Kharazmi V1 — Production deployment checklist

## Runtime
- Node.js 22+ (the current backend uses the built-in `node:sqlite`).
- Run command: `npm start` (equivalent to `node server.js`).
- The app serves both the website and `/api` from the same origin; no CORS wildcard is needed for this setup.

## Required environment variables
- `NODE_ENV=production`
- `JWT_SECRET`: random secret, at least 32 characters. Generate one with a password manager or a cryptographically secure generator. Never commit it to Git.
- `DB_FILE`: absolute path on the host's persistent disk/volume, e.g. `/var/data/kharazmi.sqlite` (use the actual path provided by your host).
- `PORT`: normally supplied automatically by the host.
- `CORS_ORIGIN`: only needed if the frontend is hosted on a different origin; use the exact origin, not `*`.

## Important SQLite hosting note
SQLite data must be stored on persistent storage. Do not rely on an ephemeral filesystem, and do not scale this single-instance SQLite app to multiple server instances. Back up the database before deploying schema/content changes. The release ZIP intentionally does not include a live SQLite database; the app seeds a fresh database on first start.

## Before opening public registration
1. Deploy to a private/staging URL with HTTPS enabled.
2. Check `GET /api/health`.
3. Register, log out, and log in again.
4. Complete a roadmap stage and submit a quiz; confirm XP and progress appear in the account.
5. Restart the service and confirm the account/progress still exist.
6. Test invalid credentials, duplicate email, malformed token, and repeated auth requests.
7. Confirm the hosting provider's backups and restore process for the persistent database.
8. Review the privacy notice and terms before collecting real users' personal data.

## Current scope / limitations
This is a release candidate for staging, not a guarantee of full production readiness. It does not yet include email verification, password reset, account deletion/export flows, admin content management, automated database backups, or a full automated security test suite. Plan these before broad public launch. The local mock fallback is for preview only; real account and progress persistence requires the deployed API.
