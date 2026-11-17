# Setup

This repository publishes the SkyTeam site to the Cloudflare Worker `skyteam-trading-hub` and its database `skyteam-db`. Every push to `main` runs the tests and then deploys.

## Secrets

Repository → **Settings → Secrets and variables → Actions**:

| Name | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → Manage account → Account API tokens (`skyteam-github-deploy`). Roll it there and paste the new value if it's ever exposed. |
| `CLOUDFLARE_ACCOUNT_ID` | `f1f9f7c57466f0371508738e25ee9c09` (not secret) |
| `RESEND_API_KEY` | Resend → API Keys, with **Sending access** for skyteamtradinghub.com |

Copy keys with the copy button and paste straight into GitHub. Don't screenshot the pages that show them.

## Publishing

Push to `main`, or go to **Actions → Deploy SkyTeam to Cloudflare → Run workflow**. The site is at:

- https://skyteam-trading-hub.dentvph.workers.dev (always)
- skyteamtradinghub.com, once the domain is switched (see `DOMAIN-SWITCH.md`)

## Who can sign in

- **Owner** (everything): `dennis@skyteamtradinghub.com`
- **Managers** (contacts and member approvals): `jong@skyteamtradinghub.com`, `support@skyteamtradinghub.com`

Change these in `wrangler.jsonc` (`OWNER_EMAILS`, `MANAGER_EMAILS`). More managers or viewers can be added in the CRM → Team access tab.
