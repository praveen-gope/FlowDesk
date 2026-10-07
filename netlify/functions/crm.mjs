import { getUser, login, logout, admin, verifyRequestOrigin } from '@netlify/identity';
import { database, transaction } from '../lib/database.mjs';
import { HttpError } from '../lib/policy.mjs';
import { bootstrapID } from '../lib/bootstrap.mjs';
import { json, body, principal, throttle, capture, dispatch } from '../lib/service.mjs';

export function captureHeaders(request, route) {
  const origin = request.headers.get('origin');
  const allowed = (process.env[route === 'support/capture' ? 'SUPPORT_FORM_ORIGINS' : 'LEAD_FORM_ORIGINS'] || '').split(',').map(value => value.trim()).filter(Boolean);
  if (origin && origin !== new URL(request.url).origin && !allowed.includes(origin)) throw new HttpError(403, 'Website origin is not allowed.');
  return origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {};
}
export default async function handler(request, context) {
  const url = new URL(request.url);
  const route = url.searchParams.get('route') || url.pathname.replace(/^\/api\//, '');
  const method = request.method;
  let headers = {};
  try {
    const publicCapture = ['capture', 'support/capture'].includes(route);
    if (publicCapture) {
      headers = captureHeaders(request, route);
      if (method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (method !== 'POST') throw new HttpError(405, 'Use POST.');
      const data = await body(request);
      // Rate limits commit even when payload validation fails later.
      await throttle(database(), route, context.ip || 'unknown');
      const response = await transaction(db => capture(db, route, data, request.headers.get('origin')));
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      return response;
    }
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) throw new HttpError(405, 'Method not allowed.');
    if (method !== 'GET') verifyRequestOrigin(request);
    if (route === 'health' && method === 'GET') {
      await database().query('SELECT id FROM fd_users LIMIT 1');
      return json({ backend: 'netlify', database: 'ready' });
    }
    if (route === 'auth/logout' && method === 'POST') { await logout(); return json({ ok: true }); }
    if (route === 'auth/login' && method === 'POST') {
      const data = await body(request);
      if (typeof data.email !== 'string' || typeof data.password !== 'string') throw new HttpError(400, 'Email and password are required.');
      await throttle(database(), 'login', context.ip || 'unknown', 10);
      const identity = await login(data.email.trim(), data.password);
      try {
        const firstAdmin = await bootstrapID(identity, admin);
        return await transaction(async db => {
          const actor = await principal(db, identity, firstAdmin);
          return dispatch(db, actor, 'auth/session', 'GET', {}, admin);
        });
      } catch (error) { await logout(); throw error; }
    }
    const identity = await getUser();
    if (!identity) {
      if (route === 'auth/session' && method === 'GET') return json({ user: null, csrfToken: '', backend: 'netlify' });
      throw new HttpError(401, 'Sign in required.');
    }
    const firstAdmin = await bootstrapID(identity, admin);
    const data = method === 'GET' || method === 'DELETE' ? {} : await body(request);
    return await transaction(async db => {
      let actor = await principal(db, identity, firstAdmin);
      if (method !== 'GET') {
        // Serialize writes with role changes so old role snapshots cannot grant access.
        actor = (await db.query('SELECT * FROM fd_users WHERE id=$1 FOR UPDATE', [actor.id])).rows[0];
        if (!actor?.active) throw new HttpError(403, 'Account is inactive.');
      }
      return dispatch(db, actor, route, method, data, admin);
    });
  } catch (error) {
    if (error instanceof HttpError || (error.name === 'AuthError' && error.status >= 400 && error.status < 500)) return json({ error: error.message }, error.status, headers);
    if (error.code === '23505') return json({ error: 'Email or name is already registered.' }, 409, headers);
    console.error('FlowDesk function failed', { route, code: error.code || error.name });
    return json({ error: 'FlowDesk backend is unavailable. Check Netlify Database provisioning and migration logs.' }, 503, headers);
  }
}
