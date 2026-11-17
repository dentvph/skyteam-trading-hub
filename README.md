# SkyTeam Trading Hub

The SkyTeam website, Member Hub and team CRM, running on Cloudflare Workers with a D1 database.

| Page | What it does |
| --- | --- |
| `/` | Landing page, welcome video, registration popup, education, market brief |
| `/market-watch` | Official U.S. economic release times (BLS) with plain-language explanations |
| `/members` | Member sign-in (emailed one-time code), UID access request, lessons, pre-trade checklist, after-trade review, private journal |
| `/crm` | Team workspace: contacts, member approvals, team access (emailed one-time code) |

## How sign-in works

There are no passwords. Members and team sign in with a 6-digit code emailed through Resend from `notifications@skyteamtradinghub.com`. Codes expire after 10 minutes, work once and lock after 5 wrong tries. Only hashes of codes and session cookies are stored.

- **Owners** are listed in `OWNER_EMAILS` and fixed **managers** in `MANAGER_EMAILS`, both in `wrangler.jsonc`.
- **Managers** (edit contacts, approve members) and **viewers** (read-only) are added by an owner in CRM → Team access.
- **Members** must be approved in CRM → Member requests (or added directly with "+ Add approved member"). Revoking ends their session immediately.
- Members' journals are private: the CRM has no access to them.

## Guides

- [docs/SETUP.md](docs/SETUP.md): putting this repository on GitHub, secrets, first publish
- [docs/DOMAIN-SWITCH.md](docs/DOMAIN-SWITCH.md): moving skyteamtradinghub.com from the old ChatGPT site

## Layout

- `site/` — static pages, styles, scripts and images (served directly by Cloudflare)
- `worker/src/` — the API (`/api/*`): registration, member hub, CRM, news feeds
- `migrations/` — D1 database schema
- `tests/e2e.test.mjs` — end-to-end tests against a local copy
- `.github/workflows/deploy-cloudflare.yml` — tests, then deploys on every push to `main`

## Deploying

Pushing to `main` runs the tests and deploys. The workflow creates the `skyteam-db` database the first time and applies migrations.

GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN` — Cloudflare account token with Workers Scripts, D1 and Workers Routes edit
- `CLOUDFLARE_ACCOUNT_ID`
- `RESEND_API_KEY` — Resend key with sending access (needed for sign-in emails)

`SESSION_SECRET` is generated automatically on the first deploy and stored as a Cloudflare secret.

## Local development

```bash
npm install
printf 'SESSION_SECRET=%s\nDEV_SHOW_CODES=1\n' "$(openssl rand -hex 32)" > .dev.vars
npm run db:migrate:local
npx wrangler dev --local          # http://127.0.0.1:8787
npm test                          # in another terminal
```

With `DEV_SHOW_CODES=1` the sign-in code is shown on screen instead of emailed. Never set it in production.

## Compliance notes

Educational content only — no trade signals or guaranteed results. The VT Markets referral guide keeps its referral disclosure and regional eligibility notices (see links on the home page).
