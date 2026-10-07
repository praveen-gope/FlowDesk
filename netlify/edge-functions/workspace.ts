import { getUser } from '@netlify/identity';
import type { Config, Context } from '@netlify/edge-functions';

export default async function workspace(request: Request, context: Context) {
  const page = new URL(request.url).pathname.replace(/\/$/, '').replace(/\.html$/, '');
  if (['/html/sign-in', '/html/lead-form', '/html/support-form', '/html/forgot-password'].includes(page)) return;
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  if (!await getUser()) {
    return new Response(null, { status: 302, headers: { Location: '/sign-in', 'Cache-Control': 'no-store' } });
  }
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export const config: Config = { path: '/html/*' };
