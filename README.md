# Sky Team Trading Hub

A trading-education landing page with three Facebook Reel players, a community enquiry popup and a private lead manager with owner-controlled team access. The website keeps the Sky Team branding, YouTube overview, Facebook contact links and VT Markets referral guide (code `eePfC6mw`).

## Video-first registration

New visitors see a popup containing the existing YouTube overview, with **Register to continue** directly below the player. The popup loads the native YouTube player without autoplay. Sound, captions, seeking and full playback remain available without registration. Selecting the registration button reveals the contact form below the same visible player without pausing, replacing or restarting it. **Back to the video** hides the form and returns to the overview without interrupting playback.

The registration popup has no X, Cancel or unregistered Continue browsing action. Escape and backdrop clicks cannot dismiss it for unregistered visitors. The landing content stays hidden and inert until the server confirms a successful form submission. Validation, network or storage errors keep the form available for retry. A successful submission saves the contact to the CRM, closes the popup, pauses the video and immediately reveals the landing page with a confirmation message. External Facebook and YouTube links do not unlock the landing page.

The same browser remembers successful registration for 30 days and skips the welcome step on return. Previously saved enquiry preferences are preserved. A reopened overview offers **Continue browsing** instead of another registration request. Clearing site data, changing browser/device or expiry shows the welcome step again. When storage is disabled, successful registration still unlocks the current page in memory. Old dismissal preferences no longer bypass registration.

The form collects name, email, phone, country and optional city, with recorded contact consent. Its copy explains that Sky Team may follow up about community access and questions; it does not create a broker account or guarantee membership or trading results. Only a registration-expiry timestamp is stored in browser storage, with a sessionStorage fallback. Contact details are saved in D1. Submission requests use signed tokens, same-origin checks, bounded inputs, idempotency keys, a honeypot and a short-lived rate limit.

This is a marketing welcome flow, not an authenticated member account or a secure content paywall: the landing markup is delivered to the browser and the preference can be edited. CRM data remains separately protected by server authorization. Registration never gates YouTube playback. Reference: https://developers.google.com/youtube/terms/developer-policies .

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
- Registration-flow tests for uninterrupted video/form transitions, blocked Escape/backdrop dismissal, failed-save retries, successful unlock, remembered/expired registration and unavailable browser storage.
- Worker/D1 integration tests for consent, origin/token rejection, idempotency, search, notes/status, CSV escaping, role enforcement, owner-only grants, normalization, role changes and revocation.
- Browser verification of the published popup/video and CRM entry is performed when the browser surface is available. The managed preview relay may be unavailable; server-rendering and API tests run independently of browser auth.

Run the checks after building with `node --test tests/*.mjs`. CRM integration tests use an isolated Miniflare database and local test identity headers, never production records. They use fixed fictional test identities and a test-only signing key. They never read private runtime configuration or production records. Registration-flow tests execute the shipped browser controller in an isolated DOM harness; they do not verify browser rendering or actual YouTube playback.

## Media and registration

The three user-supplied Facebook Reels load only after selection and have permanent direct-watch links. Branded covers are page artwork, not extracted Reel thumbnails. Loading a different Reel unloads the previous player. The MP4 copies are excluded from deployment.

The YouTube overview remains at https://www.youtube.com/watch?v=v_DsF1eeckA. Its player displays 11:30; the page describes it as about 12 minutes. WhatsApp is marked coming soon.

The exact supplied broker referral link is https://www.vtmarkets.com/en-ca/trade-now/?affid=MzQ3MzEwOTM= . The guide highlights the Referrer (Optional) field, code `eePfC6mw`, referral disclosure and regional eligibility notices. The page does not open accounts or verify broker approval.

## Research and artwork

Mobile layout and CTA guidance: https://support.google.com/google-ads/answer/6238826?hl=en and https://business.google.com/us/resources/articles/mobile-landing-page/ . These informed the design; conversion performance has not been measured.

Broker eligibility and Canadian regulator notices: https://get.vtmarkets.help/hc/en-us/articles/37317976020377-Is-there-a-restriction-on-opening-a-VT-Markets-account , https://www.bcsc.bc.ca/enforcement/early-intervention/investment-caution-list/2024/vt-markets and https://www.securities-administrators.ca/investor-alerts/vt-markets-2/ .

Hero artwork was adapted from the supplied Sky-themed poster with a dark navy horizon, blue financial-district skyline and silhouette; source poster text was removed. The existing Sky Team emblem was preserved with a transparent background. Both project assets are included under `public/assets/`.
