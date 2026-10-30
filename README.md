# Sky Team Trading Hub

A trading-education landing page with three Facebook Reel players, a community enquiry popup and a private lead manager with owner-controlled team access. The website keeps the Sky Team branding, YouTube overview, Facebook contact links and VT Markets referral guide (code `eePfC6mw`).

## Video and community enquiry

The popup opens after 10 seconds, unless the same browser remembers a dismissal (24 hours) or successful enquiry (30 days). It contains the existing YouTube overview beside a voluntary community enquiry form. YouTube loads only after an explicit play action; sound, captions, seeking and full playback remain available. Closing the popup pauses playback. Main-page overview controls open this same player.

At half the runtime reported by YouTube, a non-blocking invitation appears below the player. It does not pause, cover or restrict playback. A mandatory signup gate on YouTube playback is not implemented: YouTube's developer policies prohibit requiring an action beyond Play to view or continue the video. Strict gated playback would require a separately hosted original video. Reference: https://developers.google.com/youtube/terms/developer-policies .

The form collects name, email, phone, country and optional city, with recorded contact consent. Its copy explains that Sky Team may follow up about community access and questions; it does not create a broker account or guarantee membership or trading results. X, Escape, backdrop dismissal, Continue browsing, Facebook and YouTube links remain available.

Only reminder-expiry timestamps are stored in browser storage, with a sessionStorage fallback. Contact details are saved in D1 after a successful server response. Submission requests use signed tokens, same-origin checks, bounded inputs, idempotency keys, a honeypot and a short-lived rate limit.

## CRM and team access

Open `/crm`. The entry page offers an explicit Sign in with ChatGPT action, and does not expose lead records to anonymous visitors. The configured owner can search contacts, update follow-up stages and notes, export CSV, delete contacts and open **Team access** at `/crm/access`.

The owner adds the email a teammate uses to sign in with ChatGPT and chooses a role:

| Role | View contacts | Edit status/notes | Export/delete contacts | Manage team access |
| --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes |
| Follow-up | Yes | Yes | No | No |
| Read only | Yes | No | No | No |

The owner is defined by private runtime configuration and cannot be removed through the team form. Authorized emails and roles are stored in D1. Role checks run on every protected API request, so revocation prevents subsequent reads or edits. No invitation emails are sent; the owner can copy and share the CRM link. No additional real person has been pre-authorized in source or migrations.

Contact information is private to the owner and authorized team. Follow-up stages are New, Contacted, Registered, Joined and Archived. Broker approval and community participation are separate checks.

## Source layout

- `content/landing.html`: landing page and popup markup.
- `public/`: branding, landing styles/scripts and CRM styles.
- `app/route.ts`: serves the landing page.
- `app/crm/`: sign-in entry, protected dashboard and team-access manager.
- `app/api/leads/`: public enquiry token and submission routes.
- `app/api/crm/`: protected lead management, team-access and export routes.
- `lib/leads.ts`: validation, authorization, token, rate-limit and query helpers.
- `db/schema.ts`, `drizzle/`: D1 schema and immutable generated migration history.
- `.openai/hosting.json`: retained Site identity and logical DB binding.

## Development and deployment

This is a Vinext/Cloudflare Worker project with a D1 database. It needs a server deployment; uploading a standalone HTML file or enabling static GitHub Pages does not run the CRM backend.

Use Node 22.13 or later and the pinned package manager declared in `package.json`. Install from `pnpm-lock.yaml`, then use `pnpm dev` or `pnpm build`. Configure the private runtime values listed in `.env.example`: `CRM_OWNER_EMAIL` and `LEAD_FORM_SECRET` (at least 32 characters). Actual values belong in private deployment settings or an ignored local `.dev.vars` file.

Generate schema changes with `pnpm db:generate`. Apply pending local migrations using Wrangler and the generated `dist/server/wrangler.json`; Sites applies hosted migrations during publication. Keep applied SQL and Drizzle metadata unchanged.

GitHub contains a source copy. GitHub commits and the current Sites deployment require their respective publication workflows; no automatic two-way synchronization is configured.

## Validation

- TypeScript checks and the production build.
- Worker/D1 integration tests for consent, origin/token rejection, idempotency, search, notes/status, CSV escaping, role enforcement, owner-only grants, normalization, role changes and revocation.
- Browser verification of the published popup/video and CRM entry is performed when the browser surface is available. The managed preview relay may be unavailable; server-rendering and API tests run independently of browser auth.

Run the integration test after building with `node --test tests/crm.integration.mjs`. It uses an isolated Miniflare database and local test identity headers, never production records. It uses fixed fictional test identities and a test-only signing key. It never reads private runtime configuration or production records.

## Media and registration

The three user-supplied Facebook Reels load only after selection and have permanent direct-watch links. Branded covers are page artwork, not extracted Reel thumbnails. Loading a different Reel unloads the previous player. The MP4 copies are excluded from deployment.

The YouTube overview remains at https://www.youtube.com/watch?v=v_DsF1eeckA. Its player displays 11:30; the page describes it as about 12 minutes. WhatsApp is marked coming soon.

The exact supplied broker referral link is https://www.vtmarkets.com/en-ca/trade-now/?affid=MzQ3MzEwOTM= . The guide highlights the Referrer (Optional) field, code `eePfC6mw`, referral disclosure and regional eligibility notices. The page does not open accounts or verify broker approval.

## Research and artwork

Mobile layout and CTA guidance: https://support.google.com/google-ads/answer/6238826?hl=en and https://business.google.com/us/resources/articles/mobile-landing-page/ . These informed the design; conversion performance has not been measured.

Broker eligibility and Canadian regulator notices: https://get.vtmarkets.help/hc/en-us/articles/37317976020377-Is-there-a-restriction-on-opening-a-VT-Markets-account , https://www.bcsc.bc.ca/enforcement/early-intervention/investment-caution-list/2024/vt-markets and https://www.securities-administrators.ca/investor-alerts/vt-markets-2/ .

Hero artwork was adapted from the supplied Sky-themed poster with a dark navy horizon, blue financial-district skyline and silhouette; source poster text was removed. The existing Sky Team emblem was preserved with a transparent background. Both project assets are included under `public/assets/`.
