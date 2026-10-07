import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getUser, admin } from '@netlify/identity';
import { transaction } from '../lib/database.mjs';
import { principal } from '../lib/service.mjs';
import { HttpError } from '../lib/policy.mjs';
import { bootstrapID } from '../lib/bootstrap.mjs';

export default async function handler(request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'Content-Type': 'text/html; charset=utf-8' };
  if (!['GET','HEAD'].includes(request.method)) return new Response(null, { status: 405, headers });
  const page = new URL(request.url).searchParams.get('page') || '';
  const filename = page.endsWith('.html') ? page : page + '.html';
  if (!/^[a-z0-9-]+\.html$/.test(filename)) return new Response('Page not found.', { status: 404, headers });
  try {
    const identity = await getUser();
    if (!identity) return new Response(null, { status: 302, headers: { ...headers, Location: '/sign-in' } });
    const firstAdmin = await bootstrapID(identity, admin);
    await transaction(db => principal(db, identity, firstAdmin));
    const root = resolve('.build/workspace');
    const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
    if (!manifest.includes(filename)) return new Response('Page not found.', { status: 404, headers });
    const html = await readFile(resolve(root, filename), 'utf8');
    return new Response(request.method === 'HEAD' ? null : html, { headers });
  } catch (error) {
    if (error instanceof HttpError) return new Response('Your account has no active CRM access. Contact your administrator.', { status: error.status, headers });
    console.error('Workspace unavailable', { code: error.code || error.name });
    return new Response('Workspace unavailable. Check database configuration and migrations.', { status: 503, headers });
  }
}
