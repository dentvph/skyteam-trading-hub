import { Env, HttpError } from "./util";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function sendCodeEmail(env: Env, to: string, name: string, code: string, kind: "member" | "team") {
  const place = kind === "member" ? "SkyTeam Member Hub" : "SkyTeam CRM workspace";
  const first = name.split(" ")[0] || "there";
  const text =
    `Hi ${first},\n\nYour ${place} sign-in code is: ${code}\n\n` +
    `It expires in 10 minutes and works once. If you didn't ask for it, ignore this email.\n` +
    `SkyTeam will never ask you for this code or for your broker password.\n\n— SkyTeam Trading Hub`;
  const html = `<!doctype html><html><body style="margin:0;background:#050d1b;font-family:Arial,Helvetica,sans-serif;color:#eef6ff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#10243b;border:1px solid #345579;border-radius:16px">
<tr><td style="padding:28px">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;color:#7ddcff">SKYTEAM TRADING HUB</p>
<h1 style="margin:0 0 18px;font-size:22px;font-weight:600;color:#eef6ff">Your sign-in code</h1>
<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#b2c7de">Hi ${esc(first)}, use this code to sign in to the ${place}.</p>
<p style="margin:0 0 18px;font-size:34px;letter-spacing:8px;font-weight:700;color:#ffffff">${code}</p>
<p style="margin:0;font-size:12px;line-height:1.6;color:#b2c7de">It expires in 10 minutes and works once. If you didn't ask for it, you can ignore this email. SkyTeam will never ask you for this code or your broker password.</p>
</td></tr></table>
<p style="font-size:11px;color:#6c819a;margin-top:16px">Learn first. Trade responsibly.</p>
</td></tr></table></body></html>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      reply_to: env.EMAIL_REPLY_TO || undefined,
      subject: `${code} is your SkyTeam sign-in code`,
      text,
      html,
    }),
  });
  if (!response.ok) {
    console.error("Resend error", response.status, await response.text().catch(() => ""));
    throw new HttpError(502, "We couldn't send the email just now. Please try again in a minute.");
  }
}
