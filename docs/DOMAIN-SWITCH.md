# Moving skyteamtradinghub.com to the new site

Right now `skyteamtradinghub.com` points at the old ChatGPT site, and DNS is managed at **Spaceship**. To serve this site on the domain, Cloudflare must manage the DNS. The domain stays registered at Spaceship.

Email depends on these records. Copy them exactly, or Spacemail and the sign-in codes stop working.

## Records to copy into Cloudflare (9)

| Host | Type | Value | Proxy | Used for |
| --- | --- | --- | --- | --- |
| `@` | MX | `mx1.spacemail.com` (priority 0) | — | Spacemail inbox |
| `@` | MX | `mx2.spacemail.com` (priority 0) | — | Spacemail inbox |
| `_autodiscover._tcp` | SRV | priority 0, weight 0, port 443, target `autoconfig.spacemail.com` | — | Mail app setup |
| `@` | TXT | `v=spf1 include:spf.spacemail.com ~all` | — | Spacemail sending |
| `spacemail._domainkey` | TXT | the full `v=DKIM1;k=rsa;p=…` value from Spaceship | — | Spacemail sending |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | — | Email protection |
| `resend._domainkey` | TXT | the full `p=MIGfMA0…` value from Spaceship | — | Resend sign-in emails |
| `send` | CNAME | `send.forge.rmta.net` | **DNS only (grey)** | Resend |
| `rsend` | CNAME | `rsend.forge.rmta.net` | **DNS only (grey)** | Resend |

## Records NOT to copy (old ChatGPT site)

- `@` A `162.159.143.30`
- `@` A `172.66.3.26`
- `_cf-custom-hostname…` TXT
- `_openai-site-verification` TXT

Don't add any `@` or `www` A/CNAME record yourself. Cloudflare creates them when the site is attached (step 4).

## Steps

1. Cloudflare → **Domains → Connect a domain** → `skyteamtradinghub.com` → **Free**.
2. On the review page, compare with the table above: delete the four old ChatGPT records, add anything missing, and set `send`/`rsend` to **DNS only**.
3. Cloudflare shows two nameservers (e.g. `xxx.ns.cloudflare.com`). In Spaceship → the domain → **Nameservers** → **Custom**, replace `launch1/launch2.spaceship.net` with Cloudflare's two. Wait until Cloudflare says the domain is **Active** (minutes to a few hours).
4. Attach the site: in `wrangler.jsonc`, add
   ```jsonc
   "routes": [
     { "pattern": "skyteamtradinghub.com", "custom_domain": true },
     { "pattern": "www.skyteamtradinghub.com", "custom_domain": true }
   ],
   ```
   and push to `main`. The deploy creates the DNS entries and HTTPS certificate.
5. Test: send yourself an email at `dennis@skyteamtradinghub.com`, request a CRM sign-in code at `skyteamtradinghub.com/crm`, and open `skyteamtradinghub.com/members`.

The old ChatGPT site stays reachable at `sky-team-trading-hub.dentvph.chatgpt.site`, so its contacts can still be exported afterwards.
