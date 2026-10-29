# Sky Team Trading Hub

A trading-education landing page with three Facebook Reel players, a community enquiry popup and an owner-only lead manager. The website keeps the Sky Team branding, YouTube overview, Facebook contact links and VT Markets referral guide (code `eePfC6mw`).

## Lead capture

The popup collects name, email, phone, country and optional city. Contact consent is required and its version and timestamp are recorded. It opens automatically after 10 seconds, or immediately through Get started / Get community access, a video play control or broker registration. If the page is hidden or a policy dialog is open at the deadline, it opens when the page becomes visible or the policy dialog closes.

The enquiry must save successfully before the popup can be dismissed and the visitor can continue. Escape and backdrop clicks do not dismiss an unsaved form. Privacy details remain accessible. The confirmation offers Continue to website and the registration guide. A non-personal session flag prevents repeat gating after a successful save in the same tab; contact details are never stored in browser storage. This is a front-end enquiry flow, not an authentication or content-security boundary.

Submissions are saved in Cloudflare D1. The confirmation screen appears after a successful server save and provides the registration guide and Facebook follow-up link. Broker approval and community access are separate checks. Submission requests use signed form tokens, same-origin validation, bounded inputs, idempotency keys, a honeypot and a short-lived rate limit.

## Private CRM

Open `/crm` and sign in with the configured Sky Team owner account. The dashboard includes searchable contact records, location, timestamps, manual follow-up stages, private notes, permanent deletion with confirmation, and a CSV export of matching leads. Follow-up stages are New, Contacted, Registered, Joined and Archived.

Authorization is enforced on the server for every CRM page, read, edit, delete and export. A visitor's access to the landing page does not grant access to lead records. Follow-ups are managed through the saved contact details.

## Source layout

- `content/landing.html`: landing page and popup markup.
- `public/`: branding, landing styles/scripts and CRM styles.
- `app/route.ts`: serves the landing page.
- `app/crm/`: protected CRM page and dashboard.
- `app/api/leads/`: public enquiry token and submission routes.
- `app/api/crm/`: protected lead management and export routes.
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
- Worker/D1 integration tests for contact consent, cross-origin and token rejection, owner authorization, duplicate submission handling, search, status/notes updates, safe CSV escaping and deletion.
- Browser checks for popup submission and confirmation, responsive layouts, and the three Facebook players.

Run the integration test after building with `node --test tests/crm.integration.mjs`. It uses an isolated Miniflare database and local test identity headers, never production records. It reads ignored local configuration values; no credentials are committed.

## Media and registration

The three user-supplied Facebook Reels load only after selection and have permanent direct-watch links. Branded covers are page artwork, not extracted Reel thumbnails. Loading a different Reel unloads the previous player. The MP4 copies are excluded from deployment.

The YouTube overview remains at https://www.youtube.com/watch?v=v_DsF1eeckA. Its player displays 11:30; the page describes it as about 12 minutes. WhatsApp is marked coming soon.

The exact supplied broker referral link is https://www.vtmarkets.com/en-ca/trade-now/?affid=MzQ3MzEwOTM= . The guide highlights the Referrer (Optional) field, code `eePfC6mw`, referral disclosure and regional eligibility notices. The page does not open accounts or verify broker approval.

## Research and artwork

Mobile layout and CTA guidance: https://support.google.com/google-ads/answer/6238826?hl=en and https://business.google.com/us/resources/articles/mobile-landing-page/ . These informed the design; conversion performance has not been measured.

Broker eligibility and Canadian regulator notices: https://get.vtmarkets.help/hc/en-us/articles/37317976020377-Is-there-a-restriction-on-opening-a-VT-Markets-account , https://www.bcsc.bc.ca/enforcement/early-intervention/investment-caution-list/2024/vt-markets and https://www.securities-administrators.ca/investor-alerts/vt-markets-2/ .

Hero artwork was adapted from the supplied Sky-themed poster with a dark navy horizon, blue financial-district skyline and silhouette; source poster text was removed. The existing Sky Team emblem was preserved with a transparent background. Both project assets are included under `public/assets/`.
