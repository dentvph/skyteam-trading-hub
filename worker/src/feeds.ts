import { json } from "./util";

const FRESH_SECONDS = 15 * 60;
const UA = "SkyTeamTradingHub/1.0 (+https://skyteamtradinghub.com; support@skyteamtradinghub.com)";

/** Serve a cached JSON payload; refresh every 15 min, fall back to the last good copy for up to 7 days. */
async function cached(ctx: ExecutionContext, key: string, build: () => Promise<object>): Promise<Response> {
  const cache = caches.default;
  const freshKey = new Request(`https://cache.skyteam.internal/${key}/fresh`);
  const staleKey = new Request(`https://cache.skyteam.internal/${key}/stale`);
  const hit = await cache.match(freshKey);
  if (hit) return new Response(hit.body, hit);
  try {
    const data = await build();
    const body = JSON.stringify(data);
    const headers = { "content-type": "application/json; charset=utf-8" };
    ctx.waitUntil(Promise.all([
      cache.put(freshKey, new Response(body, { headers: { ...headers, "cache-control": `max-age=${FRESH_SECONDS}` } })),
      cache.put(staleKey, new Response(body, { headers: { ...headers, "cache-control": "max-age=604800" } })),
    ]));
    return new Response(body, { headers: { ...headers, "cache-control": "public, max-age=300" } });
  } catch (error) {
    console.error(`${key} feed failed`, error);
    const stale = await cache.match(staleKey);
    if (stale) {
      const data = (await stale.json()) as Record<string, unknown>;
      return json({ ...data, stale: true });
    }
    return json({ items: [], events: [], error: "Official source unavailable right now." }, 503);
  }
}

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();

/** Latest Federal Reserve press releases (official RSS). */
export function marketBrief(ctx: ExecutionContext) {
  return cached(ctx, "market-brief-v1", async () => {
    const r = await fetch("https://www.federalreserve.gov/feeds/press_all.xml", { headers: { "user-agent": UA } });
    if (!r.ok) throw new Error(`Fed RSS ${r.status}`);
    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 3).map((m) => {
      const tag = (t: string) => decode((m[1].match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || "");
      const url = tag("link");
      return { title: tag("title"), url, publishedAt: new Date(tag("pubDate")).toISOString() };
    }).filter((i) => i.title && /^https:\/\/www\.federalreserve\.gov\//.test(i.url));
    if (!items.length) throw new Error("Fed RSS empty");
    return { items, fetchedAt: new Date().toISOString() };
  });
}

// ---- Economic calendar (official BLS release schedule) ----

interface Explainer { match: RegExp; topic: string; priority: string; meaning: string; higher: string; lower: string; watch: string }

const EXPLAINERS: Explainer[] = [
  {
    match: /^Employment Situation/i, topic: "JOBS", priority: "High",
    meaning: "The monthly U.S. jobs report: payrolls, the unemployment rate and wage growth. It shapes expectations for Federal Reserve interest-rate decisions.",
    higher: "Stronger hiring or wages can lift rate expectations and the U.S. dollar. Gold often comes under pressure and growth stocks can wobble — but revisions and wages matter as much as the headline.",
    lower: "Weaker hiring can lower rate expectations. Gold may find support and indices can react either way, depending on whether traders read it as 'rate cuts' or 'slowdown'.",
    watch: "Spreads widen and price can whip both ways in the first minutes.",
  },
  {
    match: /^Consumer Price Index/i, topic: "INFLATION", priority: "High",
    meaning: "CPI measures how quickly consumer prices are rising. It's one of the main inflation numbers the Federal Reserve watches.",
    higher: "Hotter inflation can push yields and the U.S. dollar up, which often weighs on gold and on NASDAQ.",
    lower: "Cooler inflation can bring yields down, which may support gold and rate-sensitive tech stocks.",
    watch: "Compare the core figure (excluding food and energy) with the forecast, not just the headline.",
  },
  {
    match: /^Producer Price Index/i, topic: "INFLATION", priority: "Medium",
    meaning: "PPI tracks prices businesses receive. It can hint at where consumer inflation is heading.",
    higher: "Hotter producer prices can add to inflation worries and lift yields.",
    lower: "Cooler producer prices can ease inflation worries.",
    watch: "Usually a smaller reaction than CPI unless the surprise is large.",
  },
  {
    match: /^Job Openings and Labor Turnover/i, topic: "JOBS", priority: "Medium",
    meaning: "JOLTS shows how many jobs are open and how often people quit — a read on labour-market tightness.",
    higher: "More openings point to a tight labour market, which can keep rate expectations higher.",
    lower: "Fewer openings point to cooling demand for workers.",
    watch: "Released at 10:00 a.m. ET, often alongside other data.",
  },
  {
    match: /^Employment Cost Index/i, topic: "WAGES", priority: "Medium",
    meaning: "The ECI is a quarterly measure of what employers pay in wages and benefits.",
    higher: "Faster wage growth can feed inflation concerns and lift yields.",
    lower: "Slower wage growth can ease inflation concerns.",
    watch: "Quarterly, so surprises can carry extra weight.",
  },
  {
    match: /^(U\.S\. )?Import and Export Price/i, topic: "INFLATION", priority: "Low",
    meaning: "Tracks prices of goods coming into and leaving the U.S.",
    higher: "Higher import prices can add to inflation pressure.",
    lower: "Lower import prices can ease inflation pressure.",
    watch: "Usually a minor market mover.",
  },
];

/** Convert a New York wall-clock time to a UTC ISO string (handles daylight saving). */
function easternToUtc(y: number, mo: number, d: number, h: number, mi: number): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess + (guess - shown)).toISOString();
}

export function economicCalendar(ctx: ExecutionContext) {
  return cached(ctx, "economic-calendar-v1", async () => {
    const r = await fetch("https://www.bls.gov/schedule/news_release/bls.ics", { headers: { "user-agent": UA, accept: "text/calendar" } });
    if (!r.ok) throw new Error(`BLS ${r.status}`);
    const ics = (await r.text()).replace(/\r?\n[ \t]/g, "");
    const now = Date.now();
    const events = [...ics.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].flatMap((m) => {
      const summary = decode((m[1].match(/\nSUMMARY[^:]*:(.*)/) || [])[1] || "").replace(/\\,/g, ",");
      const start = m[1].match(/\nDTSTART[^:]*:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
      const info = EXPLAINERS.find((e) => e.match.test(summary));
      if (!info || !start) return [];
      const [, y, mo, d, h, mi] = start.map(Number);
      const at = easternToUtc(y, mo, d, h, mi);
      const t = Date.parse(at);
      if (t < now - 21 * 86_400_000 || t > now + 75 * 86_400_000) return [];
      return [{
        at, title: summary, topic: info.topic, priority: info.priority, meaning: info.meaning,
        higher: info.higher, lower: info.lower, watch: info.watch, url: "https://www.bls.gov/schedule/",
      }];
    }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    if (!events.length) throw new Error("BLS calendar empty");
    return { events, fetchedAt: new Date().toISOString(), source: "https://www.bls.gov/schedule/" };
  });
}
