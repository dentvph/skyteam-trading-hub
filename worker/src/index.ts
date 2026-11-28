import * as crm from "./crm";
import { economicCalendar, marketBrief } from "./feeds";
import { createLead, leadToken, returningLead } from "./leads";
import * as beta from "./beta";
import * as members from "./members";
import { Env, HttpError, allowedOrigins, json } from "./util";

type Handler = (env: Env, request: Request, ctx: ExecutionContext, id: number) => Promise<Response> | Response;

// [method, path pattern, handler]. ":id" matches a positive integer.
const routes: [string, string, Handler][] = [
  ["GET", "/api/leads/token", (env) => leadToken(env)],
  ["POST", "/api/leads", (env, req) => createLead(env, req)],
  ["POST", "/api/leads/returning", (env, req) => returningLead(env, req)],
  ["GET", "/api/market-brief", (_e, _r, ctx) => marketBrief(ctx)],
  ["GET", "/api/economic-calendar", (_e, _r, ctx) => economicCalendar(ctx)],

  ["POST", "/api/members/access-request", (env, req) => members.accessRequest(env, req)],
  ["POST", "/api/members/auth/request", (env, req) => members.memberAuthRequest(env, req)],
  ["POST", "/api/members/auth/verify", (env, req) => members.memberAuthVerify(env, req)],
  ["POST", "/api/members/logout", (env, req) => members.memberLogout(env, req)],
  ["GET", "/api/members/me", (env, req) => members.memberMe(env, req)],
  ["POST", "/api/members/terminal", (env, req) => beta.openTerminal(env, req)],
  ["GET", "/api/members/terminal/status", (env, req) => beta.terminalStatus(env, req)],
  ["POST", "/api/terminal/journal", (env, req) => beta.practiceJournal(env, req)],
  ["GET", "/api/members/journal", (env, req) => members.listJournal(env, req)],
  ["POST", "/api/members/journal", (env, req) => members.saveJournal(env, req)],
  ["PUT", "/api/members/journal/:id", (env, req, _c, id) => members.saveJournal(env, req, id)],
  ["DELETE", "/api/members/journal/:id", (env, req, _c, id) => members.deleteJournal(env, req, id)],

  ["POST", "/api/crm/auth/request", (env, req) => crm.teamAuthRequest(env, req)],
  ["POST", "/api/crm/auth/verify", (env, req) => crm.teamAuthVerify(env, req)],
  ["POST", "/api/crm/logout", (env, req) => crm.teamLogout(env, req)],
  ["GET", "/api/crm/me", (env, req) => crm.teamMe(env, req)],
  ["GET", "/api/crm/leads", (env, req) => crm.listLeads(env, req)],
  ["GET", "/api/crm/leads.csv", (env, req) => crm.exportLeads(env, req)],
  ["PATCH", "/api/crm/leads/:id", (env, req, _c, id) => crm.updateLead(env, req, id)],
  ["DELETE", "/api/crm/leads/:id", (env, req, _c, id) => crm.deleteLead(env, req, id)],
  ["GET", "/api/crm/members", (env, req) => crm.listMembers(env, req)],
  ["POST", "/api/crm/members", (env, req) => crm.addMember(env, req)],
  ["POST", "/api/crm/members/:id", (env, req, _c, id) => crm.reviewMember(env, req, id)],
  ["POST", "/api/crm/members/:id/beta", (env, req, _c, id) => beta.setBeta(env, req, id)],
  ["GET", "/api/crm/team", (env, req) => crm.listTeam(env, req)],
  ["POST", "/api/crm/team", (env, req) => crm.saveTeam(env, req)],
  ["DELETE", "/api/crm/team", (env, req) => crm.removeTeam(env, req)],
];

function match(method: string, path: string): { handler: Handler; id: number } | "method" | null {
  let pathMatched = false;
  for (const [m, pattern, handler] of routes) {
    const re = new RegExp(`^${pattern.replace(":id", "(\\d{1,12})")}$`);
    const hit = path.match(re);
    if (!hit) continue;
    pathMatched = true;
    if (m === method) return { handler, id: hit[1] ? Number(hit[1]) : 0 };
  }
  return pathMatched ? "method" : null;
}

/** Only registration endpoints may be called from the other allowed sites (e.g. GitHub Pages). */
const CROSS_ORIGIN_PATHS = ["/api/leads/token", "/api/leads", "/api/leads/returning", "/api/market-brief", "/api/economic-calendar"];

function corsHeaders(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST",
    "access-control-allow-headers": "content-type, x-sky-lead-token",
    "access-control-max-age": "600",
    vary: "origin",
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    const origin = request.headers.get("origin");
    const sameOrigin = !origin || origin === url.origin;
    const crossAllowed = !!origin && allowedOrigins(env).includes(origin) && CROSS_ORIGIN_PATHS.includes(url.pathname);
    const cors = crossAllowed && origin ? corsHeaders(origin) : {};

    if (request.method === "OPTIONS") {
      return crossAllowed ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    }
    // Block cross-site form posts / CSRF: changes must come from this site (or an allowed site for registration).
    if (request.method !== "GET" && !sameOrigin && !crossAllowed) {
      return json({ error: "This request must come from the SkyTeam website." }, 403);
    }

    let response: Response;
    try {
      const found = match(request.method, url.pathname);
      if (found === null) response = json({ error: "Not found." }, 404);
      else if (found === "method") response = json({ error: "Method not allowed." }, 405);
      else response = await found.handler(env, request, ctx, found.id);
    } catch (error) {
      if (error instanceof HttpError) response = json({ error: error.message }, error.status);
      else {
        console.error("Unhandled error", url.pathname, error);
        response = json({ error: "Something went wrong. Please try again." }, 500);
      }
    }
    if (crossAllowed) {
      response = new Response(response.body, response);
      for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
    }
    response.headers.set("x-content-type-options", "nosniff");
    return response;
  },
} satisfies ExportedHandler<Env>;
