import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { PGlite } from 'pglite-test';
import { verifyRequestOrigin } from '@netlify/identity';
import { roles, creatable, visible, manageable, editable, cleanFields, ids } from '../netlify/lib/policy.mjs';
import { dispatch, capture, principal, throttle, body } from '../netlify/lib/service.mjs';
import { captureHeaders } from '../netlify/functions/crm.mjs';
import { bootstrapID } from '../netlify/lib/bootstrap.mjs';

let db, users, team;
const identityAdmin = { createUser: async () => ({ id: '00000000-0000-4000-8000-000000000099' }), deleteUser: async () => {} };
before(async () => {
  db = new PGlite();
  await db.exec(await readFile('netlify/database/migrations/202610080001_flowdesk.sql', 'utf8'));
  team = (await db.query("INSERT INTO fd_teams(name) VALUES('Sales') RETURNING *")).rows[0];
  users = {};
  for (const [i, role] of Object.keys(roles).entries()) {
    users[role] = (await db.query('INSERT INTO fd_users(identity_id,email,name,role,teams) VALUES($1,$2,$3,$4,$5) RETURNING *', [`00000000-0000-4000-8000-00000000000${i + 1}`, `${role}@example.com`, role, role, [team.id]])).rows[0];
  }
});
after(async () => { await db.close(); });
const call = async (role, route, method = 'GET', data = {}) => (await dispatch(db, users[role], route, method, data, identityAdmin)).json();

test('five roles and user creation hierarchy reject escalation', () => {
  assert.equal(Object.keys(roles).length, 5);
  assert.deepEqual(creatable.sales, ['support']);
  assert.deepEqual(creatable.support, ['support']);
  assert.ok(!creatable.admin.includes('admin'));
  assert.ok(!creatable.manager.includes('admin'));
  assert.ok(creatable.super_admin.includes('admin'));
});
test('first admin requires confirmed persisted owner email, not editable metadata', async () => {
  const identity = { id: 'owner-id', email: 'kr.praveengope@gmail.com' };
  const confirmed = { ...identity, confirmedAt: new Date().toISOString() };
  assert.equal(await bootstrapID(identity, { getUser: async () => confirmed }), identity.id);
  await assert.rejects(bootstrapID(identity, { getUser: async () => identity }), /Confirm/);
  assert.equal(await bootstrapID({ id: 'attacker', email: 'other@example.com', userMetadata: { email: identity.email } }, {}), '');
});
test('SQL schema supports capture and immutable initial assignment', async () => {
  const response = await capture(db, 'capture', { name: 'External lead', email: 'lead@example.com', owner: users.sales.id, assigned_to: [users.sales.id], status: 'Won', role: 'super_admin' }, 'https://website.example');
  assert.equal(response.status, 201);
  const { id } = await response.json();
  const record = (await db.query('SELECT * FROM fd_records WHERE id=$1', [id])).rows[0];
  assert.equal(record.owner, null);
  assert.deepEqual(record.assigned_to, []);
  assert.equal(record.status, 'New');
  assert.equal(record.source, 'https://website.example');
  assert.equal(visible(users.sales, record), false);
});
test('support form stores requester, subject and a ticket reference', async () => {
  const response = await capture(db, 'support/capture', { name: 'Customer', email: 'customer@example.com', subject: 'Help', message: 'Cannot log in', priority: 'High' });
  const result = await response.json();
  assert.match(result.reference, /^FD-[A-F0-9]{32}$/);
  const record = (await db.query('SELECT * FROM fd_records WHERE id=$1', [result.id])).rows[0];
  assert.equal(record.details.Requester, 'Customer');
  assert.equal(record.kind, 'ticket');
});
test('capture rejects invalid form data and honeypot', async () => {
  await assert.rejects(capture(db, 'capture', { name: 'Bad', email: 'not-email' }), /Invalid email/);
  await assert.rejects(capture(db, 'capture', { name: 'Bot', email: 'bot@example.com', website: 'spam' }), /rejected/);
  await assert.rejects(capture(db, 'support/capture', { name: 'Customer', email: 'customer@example.com', subject: 'Help' }), /Describe/);
});
test('record CRUD and reports use matching visibility scopes', async () => {
  const { record } = await call('sales', 'records/contact', 'POST', { name: 'Owned contact', email: 'contact@example.com' });
  assert.equal(record.owner, users.sales.id);
  assert.ok((await call('sales', 'records/contact')).records.some(row => row.id === record.id));
  assert.ok(!(await call('support', 'records/contact')).records.some(row => row.id === record.id));
  assert.equal((await call('sales', 'reports')).counts.contact, 1);
  assert.equal((await call('support', 'reports')).counts.contact, 0);
  await assert.rejects(call('support', 'record/' + record.id), /not found/);
  await call('super_admin', 'record/' + record.id, 'PATCH', { team: team.id, assigned_to: [users.support.id], support_access: true });
  assert.equal((await call('support', 'record/' + record.id)).record.name, 'Owned contact');
  await assert.rejects(call('support', 'record/' + record.id, 'PATCH', { name: 'Changed' }), /read-only/);
  await assert.rejects(call('sales', 'record/' + record.id, 'DELETE'), /administrators/);
  await call('admin', 'record/' + record.id, 'DELETE');
  await assert.rejects(call('sales', 'record/' + record.id), /not found/);
});
test('support-created notes remain visible to their creator', async () => {
  const { record } = await call('support', 'records/note', 'POST', { name: 'Support note' });
  assert.equal(record.support_access, true);
  assert.ok((await call('support', 'records/note')).records.some(row => row.id === record.id));
  assert.equal(editable(users.support, 'contact'), false);
});
test('lower roles cannot assign or change support access', async () => {
  await assert.rejects(call('sales', 'records/task', 'POST', { name: 'Unauthorized', owner: users.admin.id }), /assign records/);
  await assert.rejects(call('support', 'records/task', 'POST', { name: 'Unauthorized', support_access: false }), /assign records/);
});
test('manager rejects foreign team/owner and assignee access', async () => {
  const other = (await db.query("INSERT INTO fd_teams(name) VALUES('Other') RETURNING *")).rows[0];
  await assert.rejects(call('manager', 'records/deal', 'POST', { name: 'Bad deal', team: other.id }), /only their teams/);
  const outsider = (await db.query("INSERT INTO fd_users(email,name,role) VALUES('outside@example.com','Outside','sales') RETURNING *")).rows[0];
  await assert.rejects(call('manager', 'records/deal', 'POST', { name: 'Bad deal', owner: outsider.id }), /assigned team/);
  const { record } = await call('manager', 'records/deal', 'POST', { name: 'Team deal' });
  assert.equal(record.team, team.id);
});
test('user hierarchy rejects escalation and self access edits', async () => {
  await assert.rejects(call('admin', 'users', 'POST', { role: 'super_admin' }), /cannot create/);
  await assert.rejects(call('manager', 'users', 'POST', { role: 'admin' }), /cannot create/);
  await assert.rejects(call('sales', 'users', 'POST', { role: 'sales' }), /cannot create/);
  await assert.rejects(call('admin', 'users/' + users.admin.id, 'PATCH', { active: false }), /own access/);
  await assert.rejects(call('admin', 'users/' + users.super_admin.id, 'PATCH', { role: 'support' }), /management scope/);
});
test('scoped user creation binds Identity ID and creator', async () => {
  const result = await call('sales', 'users', 'POST', { email: 'new@example.com', name: 'New User', role: 'support', password: 'long-test-password', teams: [team.id] });
  const row = (await db.query('SELECT * FROM fd_users WHERE id=$1', [result.user.id])).rows[0];
  assert.equal(row.created_by, users.sales.id);
  assert.equal(row.identity_id, '00000000-0000-4000-8000-000000000099');
  assert.ok(manageable(users.sales, row));
  assert.ok(!manageable(users.support, row));
  await call('sales', 'users/' + row.id, 'PATCH', { active: false });
  await assert.rejects(principal(db, { id: row.identity_id }), /no active CRM access/);
});
test('role metadata and matching email cannot grant access', async () => {
  await assert.rejects(principal(db, { id: '00000000-0000-4000-8000-000000000088', email: users.super_admin.email, roles: ['super_admin'] }, ''), /no active CRM access/);
  const actor = await principal(db, { id: users.sales.identity_id, roles: ['super_admin'] });
  assert.equal(actor.role, 'sales');
});
test('explicit first-admin UUID bootstraps at most one super admin', async () => {
  await db.exec('BEGIN');
  try {
    await db.query("UPDATE fd_users SET role='admin' WHERE role='super_admin'");
    const identity = { id: '00000000-0000-4000-8000-000000000077', email: 'first@example.com', name: 'First Admin' };
    const admin = await principal(db, identity, identity.id);
    assert.equal(admin.role, 'super_admin');
    const other = { id: '00000000-0000-4000-8000-000000000066', email: 'second@example.com' };
    await assert.rejects(principal(db, other, other.id), /no active CRM access/);
  } finally { await db.exec('ROLLBACK'); }
});
test('system configuration is super-admin only', async () => {
  await assert.rejects(call('admin', 'system'), /Permission denied/);
  assert.ok((await call('super_admin', 'system')).roles.super_admin);
});
test('database rate limit increments are persisted and expire', async () => {
  await throttle(db, 'test', '127.0.0.1', 1);
  await assert.rejects(throttle(db, 'test', '127.0.0.1', 1), /Too many/);
  await db.query("UPDATE fd_rate_limits SET expires_at=now()-interval '1 minute'");
  await throttle(db, 'test', '127.0.0.1', 1);
});
test('public CORS allowlist does not enable private API credentials', () => {
  const previous = process.env.LEAD_FORM_ORIGINS;
  process.env.LEAD_FORM_ORIGINS = 'https://trusted.example';
  try {
    const headers = captureHeaders(new Request('https://crm.example/api/capture', { headers: { Origin: 'https://trusted.example' } }), 'capture');
    assert.equal(headers['Access-Control-Allow-Origin'], 'https://trusted.example');
    assert.equal(headers['Access-Control-Allow-Credentials'], undefined);
    assert.throws(() => captureHeaders(new Request('https://crm.example/api/capture', { headers: { Origin: 'https://evil.example' } }), 'capture'), /not allowed/);
  } finally { if (previous === undefined) delete process.env.LEAD_FORM_ORIGINS; else process.env.LEAD_FORM_ORIGINS = previous; }
});
test('private writes reject absent and foreign Origin', () => {
  assert.throws(() => verifyRequestOrigin(new Request('https://crm.example/api/auth/login', { method: 'POST' })), /missing Origin/);
  assert.throws(() => verifyRequestOrigin(new Request('https://crm.example/api/auth/login', { method: 'POST', headers: { Origin: 'https://evil.example' } })), /did not match/);
  verifyRequestOrigin(new Request('https://crm.example/api/auth/login', { method: 'POST', headers: { Origin: 'https://crm.example' } }));
});
test('JSON parser enforces object, content type and request size', async () => {
  await assert.rejects(body(new Request('https://crm.example', { method: 'POST', body: '[]', headers: { 'Content-Type': 'application/json' } })), /JSON object/);
  await assert.rejects(body(new Request('https://crm.example', { method: 'POST', body: 'x'.repeat(17000), headers: { 'Content-Type': 'application/json' } })), /too large/);
  assert.throws(() => ids([1, '2'], 'teams'), /integer/);
  assert.throws(() => cleanFields({ details: [] }), /object/);
});
test('build separates private templates and public files, preserves design', async () => {
  await access('dist/sign-in.html');
  await assert.rejects(access('dist/html/dashboard.html'));
  await assert.rejects(access('dist/backend'));
  await assert.rejects(access('dist/.env'));
  const html = await readFile('.build/workspace/dashboard.html', 'utf8');
  assert.equal((html.match(/id="nav"/g) || []).length, 1);
  assert.ok(!html.includes('{%'));
  const login = await readFile('dist/sign-in.html', 'utf8');
  assert.ok(!login.includes('id="nav"'));
  assert.ok(login.includes('/css/style.css'));
  assert.ok(login.indexOf('/javascript/identity-browser.js') < login.indexOf('/javascript/auth.js'));
  const publicFiles = await readdir('dist/html');
  assert.deepEqual(publicFiles.sort(), ['forgot-password.html','lead-form.html','support-form.html']);
});
