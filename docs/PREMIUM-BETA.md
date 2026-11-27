# Premium Beta: SKY TEAM Smart Terminal for up to 10 members

Approved members whom the owner adds to the beta get a **⭐ Premium Beta** tab in the Member Hub, with an **Open Smart Terminal** button. The button opens a **view-only** copy of the terminal running on Dennis's PC.

```
Member Hub (skyteamtradinghub.com)          Dennis's PC
  sign-in with an emailed code                ┌─────────────────────────────────────────┐
  ⭐ Premium Beta → Open Smart Terminal ─────► │ Cloudflare Tunnel → 127.0.0.1:8766      │
  (2-minute, one-time, signed link)           │   member view: chart + zones, read-only │
                                              │ main terminal 127.0.0.1:8765 (Dennis)   │
                                              │   NOT reachable through the tunnel       │
                                              └─────────────────────────────────────────┘
```

## How it stays safe

- **Seats:** only the **owner** can give or remove a beta seat, in CRM → Member requests. There's a hard limit of **10** seats. Revoking a member also frees their seat.
- **The link:**
  - The site signs a **one-time link** that expires after **2 minutes**. It's signed with HMAC-SHA256 using `TERMINAL_SSO_SECRET`.
  - The terminal checks the signature, the expiry, and that the link hasn't been used before.
  - The member's terminal session then lasts 12 hours.
- **Member view (port 8766):** a separate server that only answers read-only chart routes:
  - The chart, zones and session maps work.
  - Trading, the account, positions, the journal, the AI, the bot and settings all return **403**.
- **Main terminal (port 8765):** it refuses any request that comes through Cloudflare (proxy headers). Even a wrong tunnel setting can't reach Dennis's trading screen.
- **Sign-in log:** every sign-in and every refused link is logged on the PC in `member_access.csv`.
  - You can see it under 📱 → ⭐ Premium Beta.
  - **Pause** cuts a member off right away.

## One-time setup (about 20 minutes)

1. **Merge the pull request.** The deploy adds the beta columns to the database (migration `0002_premium_beta.sql`).
2. **Restart the terminal.**
   - Close the black `start.bat` window and start it again.
   - It prints `Premium Beta member view -> http://127.0.0.1:8766`.
3. **Copy the beta secret.**
   - In the terminal, open the 📱 button → **⭐ Premium Beta** → **Copy secret**.
4. **Add the secret to GitHub.**
   - Go to the repository → **Settings → Secrets and variables → Actions → New repository secret**.
   - Name it `TERMINAL_SSO_SECRET` and paste the secret as the value.
   - Then go to **Actions → Deploy SkyTeam to Cloudflare → Run workflow**.
5. **Create the Cloudflare Tunnel**, in the same Cloudflare account that has skyteamtradinghub.com:
   1. Go to **Networking → Tunnels** (older dashboard: **Zero Trust → Networks → Tunnels**) → **Create a tunnel** → **Cloudflared**, and name it `skyteam-terminal`.
   2. Choose **Windows**, download `cloudflared`, then run the command the page shows in an **administrator** Command Prompt: `cloudflared.exe service install <TOKEN>`. The tunnel then runs in the background every time Windows starts.
   3. Add a route: **Published application**.
      - Subdomain `terminal`, domain `skyteamtradinghub.com`.
      - Service **HTTP** → `localhost:8766`.
   4. ⚠️ Use **8766**. **Never 8765**: that's the main terminal, which has trading.
6. **Give the seats.** In the CRM (`/crm` → Member requests), press **⭐ Add to beta** on up to 10 approved members.
7. **Test it yourself.**
   - Approve your own email as a member and add yourself to the beta.
   - Sign in at `/members` → ⭐ Premium Beta → **Open Smart Terminal**.
   - You should see the chart with a gold **PREMIUM BETA · View-only** bar, and no Trade panel.

## Day to day

- **Uptime:** the terminal is live only while the PC, MT5 and `start.bat` are running. Outside those times the link shows a Cloudflare "offline" page.
- **Removing someone:** use CRM → **Remove from beta**, which takes effect on their next link. For an immediate cut-off, use 📱 → Premium Beta → **Pause**.
- **Feedback:** testers use the feedback link in their tab, which goes to support@skyteamtradinghub.com.

## Compliance reminders

The member view is an educational chart-reading tool:
- No trade buttons.
- No signals are pushed to members. Session maps are shown, but alerts are not.
- Backtest numbers are labelled as past results.
- Keep the "education, not signals" wording when you promote the beta.
- Check with VT Markets whether showing their MT5 prices to members is allowed. Broker data licences often limit redistribution.
