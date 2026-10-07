import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApi } from '../server/netlify/api.js';
import { ApiError, canEdit, canManage, canView, cleanFields, creatableRoles, integerIds, isRole, payload, type Actor, type ScopedRecord } from '../server/netlify/policy.js';

function actor(role: string, id = 1, teams = [1]): Actor {
  return { id, role, teams };
}

function record(overrides: Partial<ScopedRecord> = {}): ScopedRecord {
  return { kind: 'lead', owner: 1, team: 1, assignedTo: [1], supportAccess: false, ...overrides };
}

test('administrators can view records across teams', () => {
  for (const role of ['super_admin', 'admin']) assert.equal(canView(actor(role), record({ team: 2, owner: 2, assignedTo: [] })), true);
});

test('managers see only records assigned to their teams', () => {
  assert.equal(canView(actor('manager'), record()), true);
  assert.equal(canView(actor('manager'), record({ team: 2 })), false);
  assert.equal(canView(actor('manager'), record({ team: null })), false);
  assert.equal(canView(actor('manager', 1, []), record()), false);
});

test('sales access requires ownership or explicit assignment and an allowed module', () => {
  assert.equal(canView(actor('sales'), record()), true);
  assert.equal(canView(actor('sales'), record({ owner: 2 })), true);
  assert.equal(canView(actor('sales'), record({ owner: 2, assignedTo: [] })), false);
  assert.equal(canView(actor('sales'), record({ kind: 'invoice' })), false);
  assert.equal(canView(actor('sales'), record({ kind: 'ticket', supportAccess: true })), false);
});

test('support requires explicit assignment, support access, and an allowed module', () => {
  assert.equal(canView(actor('support'), record({ kind: 'ticket', supportAccess: true })), true);
  assert.equal(canView(actor('support'), record({ kind: 'ticket' })), false);
  assert.equal(canView(actor('support'), record({ kind: 'ticket', supportAccess: true, assignedTo: [] })), false);
  assert.equal(canView(actor('support'), record({ supportAccess: true })), false);
  assert.equal(canView(actor('unrecognized'), record({ kind: 'ticket', supportAccess: true })), false);
});

test('write permissions preserve the five-role matrix', () => {
  assert.equal(canEdit(actor('admin'), 'invoice'), true);
  assert.equal(canEdit(actor('manager'), 'invoice'), false);
  assert.equal(canEdit(actor('manager'), 'ticket'), true);
  assert.equal(canEdit(actor('sales'), 'deal'), true);
  assert.equal(canEdit(actor('sales'), 'document'), false);
  assert.equal(canEdit(actor('support'), 'note'), true);
  assert.equal(canEdit(actor('support'), 'contact'), false);
  assert.equal(canEdit(actor('unrecognized'), 'task'), false);
});

test('only super administrators can create administrator roles', () => {
  assert.ok(creatableRoles.super_admin.includes('admin'));
  for (const role of ['admin', 'manager', 'sales', 'support'] as const) {
    assert.ok(!creatableRoles[role].includes('admin'));
    assert.ok(!creatableRoles[role].includes('super_admin'));
  }
  assert.deepEqual(creatableRoles.sales, ['support']);
  assert.deepEqual(creatableRoles.support, ['support']);
  assert.equal(isRole('constructor'), false);
  assert.equal(isRole('super_admin'), true);
});

test('manager user-management scope excludes peers and outside teams', () => {
  assert.equal(canManage(actor('manager'), actor('manager', 2)), false);
  assert.equal(canManage(actor('manager'), { ...actor('manager', 2), createdBy: 1 }), true);
  assert.equal(canManage(actor('manager'), actor('sales', 2)), true);
  assert.equal(canManage(actor('manager'), { ...actor('sales', 2, [1, 2]), createdBy: 1 }), false);
  assert.equal(canManage(actor('manager'), actor('support', 2, [2])), false);
});

test('sales and support can manage only support accounts they created', () => {
  for (const role of ['sales', 'support']) {
    assert.equal(canManage(actor(role), { ...actor('support', 2), createdBy: 1 }), true);
    assert.equal(canManage(actor(role), { ...actor('support', 2), createdBy: 3 }), false);
    assert.equal(canManage(actor(role), { ...actor('sales', 2), createdBy: 1 }), false);
  }
});

test('ID lists reject booleans, fractional numbers, and strings', () => {
  for (const value of [[true], [1.5], ['1'], [-1], [0], null, {}]) assert.throws(() => integerIds(value, 'teams'), ApiError);
  assert.deepEqual(integerIds([1, 2, 1], 'teams'), [1, 2]);
});

test('public fields cannot inject ownership, permissions, or arbitrary details', () => {
  assert.deepEqual(cleanFields({ name: ' Customer ', email: 'customer@example.test', owner: 99, assigned_to: [99], support_access: true, details: { role: 'admin' } }, true), { name: 'Customer', email: 'customer@example.test' });
});

test('field validation rejects invalid email, empty names, and oversized input', () => {
  assert.throws(() => cleanFields({ name: '', email: 'customer@example.test' }, true), ApiError);
  assert.throws(() => cleanFields({ name: 'Customer', email: 'invalid' }, true), ApiError);
  assert.throws(() => cleanFields({ message: 'x'.repeat(4001) }), ApiError);
  assert.throws(() => cleanFields({ name: 1 }), ApiError);
});

test('JSON payloads must be objects with an explicit JSON content type', async () => {
  for (const value of ['[]', 'null', '"text"', '{invalid']) {
    await assert.rejects(payload(new Request('https://example.test/api/records/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: value })), ApiError);
  }
  await assert.rejects(payload(new Request('https://example.test/api/records/lead', { method: 'POST', body: '{}' })), ApiError);
  assert.deepEqual(await payload(new Request('https://example.test/api/records/lead', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '{"name":"Customer"}' })), { name: 'Customer' });
});

test('oversized bodies are rejected even without a content-length header', async () => {
  await assert.rejects(payload(new Request('https://example.test/api/records/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'x'.repeat(17000) }) })), error => error instanceof ApiError && error.status === 413);
});

test('anonymous session does not access the database', async () => {
  const response = await handleApi(new Request('https://example.test/api/auth/session'), '127.0.0.1');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { user: null });
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('private CRM endpoints require an Identity session', async () => {
  for (const path of ['/api/leads', '/api/reports', '/api/users', '/api/teams', '/api/records/lead', '/api/system']) {
    const response = await handleApi(new Request(`https://example.test${path}`), '127.0.0.1');
    assert.equal(response.status, 401);
  }
});

test('cross-origin private writes and missing origins are rejected', async () => {
  for (const origin of ['https://attacker.invalid', null]) {
    const response = await handleApi(new Request('https://example.test/api/users', { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), 'Content-Type': 'application/json' }, body: '{}' }), '127.0.0.1');
    assert.equal(response.status, 403);
  }
});

test('capture preflight is restricted to allowed origins', async () => {
  const accepted = await handleApi(new Request('https://example.test/api/capture', { method: 'OPTIONS', headers: { Origin: 'https://example.test' } }), '127.0.0.1');
  assert.equal(accepted.status, 204);
  assert.equal(accepted.headers.get('access-control-allow-origin'), 'https://example.test');
  assert.equal(accepted.headers.get('vary'), 'Origin');
  const rejected = await handleApi(new Request('https://example.test/api/support/capture', { method: 'OPTIONS', headers: { Origin: 'https://attacker.invalid' } }), '127.0.0.1');
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

test('capture validates fields and honeypots before connecting to storage', async () => {
  for (const body of [{ website: 'bot' }, { name: 'Customer', email: 'invalid' }]) {
    const response = await handleApi(new Request('https://example.test/api/capture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), '127.0.0.1');
    assert.equal(response.status, 400);
  }
});
