import pages from '@/deployment/pages.json';
import { json, sameOrigin } from '@/lib/leads';

// Only the public contact form accepts the owner's GitHub Pages origin.
// CRM endpoints retain their existing same-origin and identity requirements.
const pagesOrigin = new URL(pages.siteUrl).origin;
export function leadOriginAllowed(request: Request) {
  return sameOrigin(request) || request.headers.get('origin') === pagesOrigin;
}
export function leadJson(request: Request, value: unknown, status = 200) {
  const response = json(value, status);
  response.headers.set('vary', 'Origin');
  if (request.headers.get('origin') === pagesOrigin) response.headers.set('access-control-allow-origin', pagesOrigin);
  return response;
}
export function leadPreflight(request: Request, method: 'GET' | 'POST') {
  const requestedHeaders = (request.headers.get('access-control-request-headers') || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
  if (!leadOriginAllowed(request) || request.headers.get('access-control-request-method') !== method || requestedHeaders.some(value => !['content-type', 'x-sky-lead-token'].includes(value))) {
    return leadJson(request, { error: 'This origin or request is not permitted.' }, 403);
  }
  const response = new Response(null, { status: 204, headers: {
    'cache-control': 'private, no-store',
    'vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
    'access-control-allow-methods': method,
    'access-control-allow-headers': 'Content-Type, X-Sky-Lead-Token',
    'access-control-max-age': '600',
  } });
  if (request.headers.get('origin') === pagesOrigin) response.headers.set('access-control-allow-origin', pagesOrigin);
  return response;
}
