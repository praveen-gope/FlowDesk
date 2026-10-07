import { createHash } from 'node:crypto';
import { admin, AuthError, getUser, logout, verifyRequestOrigin, type User as IdentityUser } from '@netlify/identity';
import { and, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { database } from '../../db/index.js';
import { auditEvents, rateLimits, records, teams, users } from '../../db/schema.js';
import { ApiError, canEdit, canManage, cleanFields, creatableRoles, integerIds, isAdministrator, isRole, kinds, payload, roles, salesKinds, supportKinds, type Actor } from './policy.js';

type Database = ReturnType<typeof database>;
type WorkspaceUser = typeof users.$inferSelect;
type WorkspaceRecord = typeof records.$inferSelect;

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

export function origins(request: Request, support = false) {
  const configured = process.env[support ? 'SUPPORT_FORM_ORIGINS' : 'LEAD_FORM_ORIGINS'] || '';
  const allowed = configured.split(',').map(value => {
    try { return new URL(value.trim()).origin; } catch { return ''; }
  }).filter(Boolean);
  return [new URL(request.url).origin, ...allowed];
}

function captureHeaders(request: Request, allowed: string[]) {
  const origin = request.headers.get('origin');
  if (origin && !allowed.includes(origin)) throw new ApiError('Website origin is not allowed.', 403);
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

async function actorFor(db: Database, identity: IdentityUser) {
  let [actor] = await db.select().from(users).where(eq(users.identityId, identity.id));
  if (!actor) {
    const trustedRole = Object.keys(roles).find(role => identity.roles?.includes(role));
    if (!isRole(trustedRole) || !identity.email) throw new ApiError('Your account has no workspace access. Ask an administrator to invite you.', 403);
    await db.insert(users).values({
      identityId: identity.id,
      email: identity.email.trim().toLowerCase(),
      name: (identity.name || identity.email).slice(0, 150),
      role: trustedRole,
    }).onConflictDoNothing();
    [actor] = await db.select().from(users).where(eq(users.identityId, identity.id));
  }
  if (!actor || !actor.active || !isRole(actor.role)) throw new ApiError('This workspace account is disabled.', 403);
  return actor;
}

async function userJson(db: Database, actor: WorkspaceUser) {
  const groups = actor.teams.length ? await db.select().from(teams).where(inArray(teams.id, actor.teams)) : [];
  return { id: actor.id, name: actor.name, email: actor.email, role: actor.role, roleLabel: roles[actor.role as keyof typeof roles], teams: groups, active: actor.active };
}

function recordJson(record: WorkspaceRecord) {
  return {
    id: record.id, kind: record.kind, name: record.name, email: record.email, phone: record.phone,
    company: record.company, message: record.message, source: record.source, status: record.status,
    details: record.details, owner: record.owner, team: record.team, assigned_to: record.assignedTo,
    support_access: record.supportAccess, createdAt: record.createdAt.toISOString(),
  };
}

function visible(actor: Actor): SQL | undefined {
  if (isAdministrator(actor)) return undefined;
  if (actor.role === 'manager') return actor.teams.length ? inArray(records.team, actor.teams) : sql`false`;
  const assigned = sql`${records.assignedTo} @> ${JSON.stringify([actor.id])}::jsonb`;
  if (actor.role === 'sales') return and(inArray(records.kind, salesKinds), or(eq(records.owner, actor.id), assigned));
  return and(inArray(records.kind, supportKinds), eq(records.supportAccess, true), assigned);
}

async function audit(db: Database, actor: Actor | null, action: string, target: string) {
  await db.insert(auditEvents).values({ actor: actor?.id || null, action, target });
}

async function throttle(db: Database, ip: string, category: string) {
  const key = createHash('sha256').update(`${category}:${ip}`).digest('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + 60000);
  await db.delete(rateLimits).where(sql`${rateLimits.expiresAt} < ${new Date(now.getTime() - 60000)}`);
  const [limit] = await db.insert(rateLimits).values({ key, expiresAt: expires }).onConflictDoUpdate({
    target: rateLimits.key,
    set: {
      count: sql`CASE WHEN ${rateLimits.expiresAt} <= ${now} THEN 1 ELSE ${rateLimits.count} + 1 END`,
      expiresAt: sql`CASE WHEN ${rateLimits.expiresAt} <= ${now} THEN ${expires} ELSE ${rateLimits.expiresAt} END`,
    },
  }).returning();
  if (limit.count > 20) throw new ApiError('Too many submissions. Wait a minute.', 429);
}

async function validateTeams(db: Database, actor: Actor, value: unknown) {
  const ids = integerIds(value, 'teams');
  const found = ids.length ? await db.select().from(teams).where(inArray(teams.id, ids)) : [];
  if (found.length !== ids.length) throw new ApiError('Unknown team.');
  if (!isAdministrator(actor) && ids.some(id => !actor.teams.includes(id))) throw new ApiError('You can assign users only within your teams.', 403);
  return ids;
}

async function assignment(db: Database, actor: Actor, data: Record<string, unknown>, current: {
  owner: number | null; team: number | null; assignedTo: number[]; supportAccess: boolean;
}) {
  const next = { ...current };
  const changing = ['owner', 'team', 'assigned_to', 'support_access'].some(key => Object.hasOwn(data, key));
  if (!changing) return next;
  if (!isAdministrator(actor) && actor.role !== 'manager') throw new ApiError('Only administrators and managers can assign records.', 403);
  if (Object.hasOwn(data, 'support_access')) {
    if (typeof data.support_access !== 'boolean') throw new ApiError('support_access must be true or false.');
    next.supportAccess = data.support_access;
  }
  if (Object.hasOwn(data, 'team')) {
    next.team = data.team === null ? null : integerIds([data.team], 'team')[0];
    if (next.team !== null) {
      const [team] = await db.select().from(teams).where(eq(teams.id, next.team));
      if (!team) throw new ApiError('Unknown team.');
    }
    if (actor.role === 'manager' && (next.team === null || !actor.teams.includes(next.team))) throw new ApiError('Managers can assign only their own teams.', 403);
  }
  if (Object.hasOwn(data, 'owner')) next.owner = data.owner === null ? null : integerIds([data.owner], 'owner')[0];
  if (Object.hasOwn(data, 'assigned_to')) next.assignedTo = integerIds(data.assigned_to, 'assigned_to');
  const ids = [...new Set([...(next.owner === null ? [] : [next.owner]), ...next.assignedTo])];
  const people = ids.length ? await db.select().from(users).where(and(inArray(users.id, ids), eq(users.active, true))) : [];
  if (people.length !== ids.length) throw new ApiError('Unknown or disabled assignee.');
  if (actor.role === 'manager' && people.some(person => next.team === null || !person.teams.includes(next.team))) throw new ApiError('Assignees must belong to the assigned team.', 403);
  return next;
}

function details(data: Record<string, unknown>) {
  if (!Object.hasOwn(data, 'details')) return undefined;
  if (!data.details || typeof data.details !== 'object' || Array.isArray(data.details)) throw new ApiError('details must be an object.');
  return data.details as Record<string, unknown>;
}

async function capture(request: Request, ip: string, support: boolean) {
  const headers = captureHeaders(request, origins(request, support));
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, headers);
  try {
    const data = await payload(request);
    if (data.website) throw new ApiError('Submission rejected.');
    const fields = cleanFields(data, true);
    delete fields.status;
    const db = database();
    await throttle(db, ip, support ? 'support_capture' : 'capture');
    let subject = fields.name!;
    let ticketDetails = {};
    if (support) {
      if (typeof data.subject !== 'string' || !data.subject.trim() || data.subject.trim().length > 160) throw new ApiError('A subject is required (maximum 160 characters).');
      if (!fields.message) throw new ApiError('Describe your support request.');
      const priority = data.priority ?? 'Normal';
      const category = data.category ?? 'Support';
      if (!['Low', 'Normal', 'High', 'Urgent'].includes(priority as string)) throw new ApiError('Invalid priority.');
      if (!['Support', 'Technical issue', 'Billing', 'General enquiry'].includes(category as string)) throw new ApiError('Invalid category.');
      subject = data.subject.trim();
      ticketDetails = { Requester: fields.name, Priority: priority, Category: category };
    }
    const saved = await db.transaction(async tx => {
      const [record] = await tx.insert(records).values({
        ...fields, kind: support ? 'ticket' : 'lead', name: subject, status: support ? 'Open' : 'New',
        source: fields.source || request.headers.get('origin') || 'Website form',
        details: ticketDetails, supportAccess: support,
      }).returning();
      await tx.insert(auditEvents).values({ action: support ? 'support.captured' : 'lead.captured', target: record.id });
      return record;
    });
    return json({ id: saved.id, ...(support ? { reference: `FD-${saved.id.replaceAll('-', '').toUpperCase()}` } : {}), message: support ? 'Your support request has been received.' : 'Lead captured successfully.' }, 201, headers);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status, headers);
    return json({ error: 'Could not save the submission. Please try again later.' }, 503, headers);
  }
}

async function recordRoutes(request: Request, db: Database, actor: WorkspaceUser, path: string) {
  const module = path.match(/^\/api\/records\/([a-z]+)$/)?.[1];
  const id = path.match(/^\/api\/record\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})$/i)?.[1];
  if (module) {
    if (!kinds.includes(module)) throw new ApiError('Unknown module.', 404);
    if (request.method === 'GET') {
      const rows = await db.select().from(records).where(and(visible(actor), eq(records.kind, module))).orderBy(desc(records.createdAt));
      return json({ records: rows.map(recordJson) });
    }
    if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405);
    if (!canEdit(actor, module)) throw new ApiError('Permission denied.', 403);
    const data = await payload(request);
    const fields = cleanFields(data);
    if (!fields.name) throw new ApiError('Name is required.');
    const initial = { owner: actor.id, team: actor.role === 'manager' ? actor.teams[0] || null : null, assignedTo: [actor.id], supportAccess: actor.role === 'support' };
    if (actor.role === 'manager' && !initial.team) throw new ApiError('A team assignment is required.', 403);
    const access = await assignment(db, actor, data, initial);
    const recordDetails = details(data) || {};
    const record = await db.transaction(async tx => {
      const [created] = await tx.insert(records).values({ ...fields, name: fields.name!, kind: module, ...access, details: recordDetails }).returning();
      await tx.insert(auditEvents).values({ actor: actor.id, action: 'record.created', target: created.id });
      return created;
    });
    return json({ record: recordJson(record) }, 201);
  }
  if (!id) throw new ApiError('Not found.', 404);
  const [current] = await db.select().from(records).where(and(visible(actor), eq(records.id, id)));
  if (!current) throw new ApiError('Record not found.', 404);
  if (request.method === 'GET') return json({ record: recordJson(current) });
  if (request.method === 'DELETE') {
    if (!isAdministrator(actor)) throw new ApiError('Only administrators can delete records.', 403);
    await db.transaction(async tx => {
      await tx.delete(records).where(eq(records.id, id));
      await tx.insert(auditEvents).values({ actor: actor.id, action: 'record.deleted', target: id });
    });
    return json({ ok: true });
  }
  if (request.method !== 'PATCH') throw new ApiError('Method not allowed.', 405);
  if (!canEdit(actor, current.kind)) throw new ApiError('This record is read-only for your role.', 403);
  const data = await payload(request);
  const access = await assignment(db, actor, data, current);
  const fields = cleanFields(data);
  const recordDetails = details(data);
  const saved = await db.transaction(async tx => {
    const [updated] = await tx.update(records).set({ ...fields, ...access, ...(recordDetails ? { details: recordDetails } : {}), updatedAt: new Date() }).where(and(visible(actor), eq(records.id, id))).returning();
    if (!updated) throw new ApiError('Record not found.', 404);
    await tx.insert(auditEvents).values({ actor: actor.id, action: 'record.updated', target: id });
    return updated;
  });
  return json({ record: recordJson(saved) });
}

async function userRoutes(request: Request, db: Database, actor: WorkspaceUser, path: string) {
  if (!isRole(actor.role)) throw new ApiError('Permission denied.', 403);
  if (path === '/api/users' && request.method === 'GET') {
    const people = await db.select().from(users);
    const allowed = creatableRoles[actor.role];
    return json({ users: await Promise.all(people.filter(person => canManage(actor, person)).map(person => userJson(db, person))), roles: allowed.map(role => ({ value: role, label: roles[role] })) });
  }
  if (path === '/api/users' && request.method === 'POST') {
    const data = await payload(request);
    const role = data.role || 'support';
    if (!isRole(role)) throw new ApiError('Unknown role.');
    if (!creatableRoles[actor.role].includes(role)) throw new ApiError('Your role cannot create this account type.', 403);
    const email = cleanFields({ email: data.email }).email?.toLowerCase();
    if (!email) throw new ApiError('A valid email is required.');
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    if (!name || name.length > 150) throw new ApiError('A name is required (maximum 150 characters).');
    if (typeof data.password !== 'string' || data.password.length < 10 || data.password.length > 128) throw new ApiError('Use a password between 10 and 128 characters.');
    const teamIds = await validateTeams(db, actor, data.teams ?? (isAdministrator(actor) ? [] : actor.teams));
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) throw new ApiError('Email is already registered.');
    const identity = await admin.createUser({ email, password: data.password, data: { user_metadata: { full_name: name } } });
    let person;
    try {
      person = await db.transaction(async tx => {
        const [created] = await tx.insert(users).values({ identityId: identity.id, name, email, role, teams: teamIds, createdBy: actor.id }).returning();
        await tx.insert(auditEvents).values({ actor: actor.id, action: 'user.created', target: String(created.id) });
        return created;
      });
    } catch (error) {
      await admin.deleteUser(identity.id).catch(() => undefined);
      throw error;
    }
    return json({ user: await userJson(db, person) }, 201);
  }
  const id = path.match(/^\/api\/users\/(\d+)$/)?.[1];
  if (!id) throw new ApiError('Method not allowed.', 405);
  if (request.method !== 'PATCH') throw new ApiError('Method not allowed.', 405);
  const [target] = await db.select().from(users).where(eq(users.id, Number(id)));
  if (!target) throw new ApiError('User not found.', 404);
  if (target.id === actor.id) throw new ApiError('You cannot change your own access.', 403);
  if (!canManage(actor, target)) throw new ApiError('This account is outside your user-management scope.', 403);
  const data = await payload(request);
  const role = data.role ?? target.role;
  if (!isRole(role)) throw new ApiError('Unknown role.');
  if (!creatableRoles[actor.role].includes(role)) throw new ApiError('Role escalation is not allowed.', 403);
  if (Object.hasOwn(data, 'active') && typeof data.active !== 'boolean') throw new ApiError('active must be true or false.');
  const teamIds = Object.hasOwn(data, 'teams') ? await validateTeams(db, actor, data.teams) : target.teams;
  const person = await db.transaction(async tx => {
    const [updated] = await tx.update(users).set({ role, active: typeof data.active === 'boolean' ? data.active : target.active, teams: teamIds }).where(eq(users.id, target.id)).returning();
    await tx.insert(auditEvents).values({ actor: actor.id, action: 'user.updated', target: String(target.id) });
    return updated;
  });
  return json({ user: await userJson(db, person) });
}

export async function handleApi(request: Request, ip: string) {
  try {
    const path = new URL(request.url).pathname.replace(/\/$/, '');
    if (path === '/api/capture' || path === '/api/support/capture') return await capture(request, ip, path.includes('/support/'));
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) throw new ApiError('Method not allowed.', 405);
    if (request.method !== 'GET') verifyRequestOrigin(request);
    if (path === '/api/auth/login') throw new ApiError('Sign in through the Netlify sign-in page.', 410);
    const identity = await getUser();
    if (path === '/api/auth/session') {
      if (request.method !== 'GET') throw new ApiError('Method not allowed.', 405);
      if (!identity) return json({ user: null });
      const db = database();
      return json({ user: await userJson(db, await actorFor(db, identity)) });
    }
    if (!identity) throw new ApiError('Sign in required.', 401);
    if (path === '/api/auth/logout') {
      if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405);
      await logout();
      return json({ ok: true });
    }
    const db = database();
    const actor = await actorFor(db, identity);
    if (path.startsWith('/api/records/') || path.startsWith('/api/record/')) return await recordRoutes(request, db, actor, path);
    if (path === '/api/users' || /^\/api\/users\/\d+$/.test(path)) return await userRoutes(request, db, actor, path);
    if (path === '/api/leads' && request.method === 'GET') {
      const rows = await db.select().from(records).where(and(visible(actor), eq(records.kind, 'lead'))).orderBy(desc(records.createdAt));
      return json({ leads: rows.map(recordJson) });
    }
    if (path === '/api/reports' && request.method === 'GET') {
      const totals = await db.select({ kind: records.kind, count: sql<number>`count(*)::int` }).from(records).where(visible(actor)).groupBy(records.kind);
      return json({ counts: Object.fromEntries(kinds.map(kind => [kind, totals.find(total => total.kind === kind)?.count || 0])) });
    }
    if (path === '/api/teams') {
      if (request.method === 'GET') return json({ teams: isAdministrator(actor) ? await db.select().from(teams) : actor.teams.length ? await db.select().from(teams).where(inArray(teams.id, actor.teams)) : [] });
      if (request.method !== 'POST') throw new ApiError('Method not allowed.', 405);
      if (!isAdministrator(actor)) throw new ApiError('Permission denied.', 403);
      const data = await payload(request);
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 120) throw new ApiError('A team name is required (maximum 120 characters).');
      const [team] = await db.insert(teams).values({ name: data.name.trim() }).onConflictDoUpdate({ target: teams.name, set: { name: data.name.trim() } }).returning();
      await audit(db, actor, 'team.created', String(team.id));
      return json({ team }, 201);
    }
    if (path === '/api/assignees' && request.method === 'GET') {
      if (!isAdministrator(actor) && actor.role !== 'manager') throw new ApiError('Permission denied.', 403);
      const people = await db.select().from(users).where(eq(users.active, true));
      return json({ users: await Promise.all(people.filter(person => isAdministrator(actor) || person.teams.some(team => actor.teams.includes(team))).map(person => userJson(db, person))) });
    }
    if (path === '/api/system' && request.method === 'GET') {
      if (actor.role !== 'super_admin') throw new ApiError('Permission denied.', 403);
      return json({ roles, leadFormOrigins: origins(request).slice(1), audit: await db.select({ action: auditEvents.action, target: auditEvents.target, created_at: auditEvents.createdAt }).from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(100) });
    }
    throw new ApiError('Not found.', 404);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    if (error instanceof AuthError) return json({ error: error.status === 403 ? 'Request origin is not allowed.' : 'Identity could not complete this request. Check the account and Identity settings.' }, error.status && error.status >= 400 && error.status < 500 ? error.status : 503);
    return json({ error: 'The workspace is temporarily unavailable. Check Netlify Identity and Database configuration.' }, 503);
  }
}
