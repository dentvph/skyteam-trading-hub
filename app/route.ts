import landing from '@/content/landing.html?raw';
export function GET() {
  return new Response(landing, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' } });
}
