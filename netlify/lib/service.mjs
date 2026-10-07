import { randomUUID, createHash } from 'node:crypto';
import { roles, creatable, kinds, HttpError, requireAccess, administrator, privileged, editable, manageable, visibilitySQL, text, email, ids, cleanFields } from './policy.mjs';

export const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export function userJSON(user, teams) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, roleLabel: roles[user.role], active: user.active, teams: teams.filter(team => user.teams.includes(team.id)) };
}
export function recordJSON(record) {
  const { created_at, updated_at, ...data } = record;
  return { ...data, createdAt: new Date(created_at).toISOString() };
}
export async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(400, 'Send application/json.');
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 16384) throw new HttpError(413, 'Request is too large.');
  let data;
  try { data = JSON.parse(raw); } catch { throw new HttpError(400, 'Invalid JSON.'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Send a JSON object.');
  return data;
}
export async function principal(db, identity, bootstrapId = process.env.FLOWDESK_FIRST_ADMIN_ID) {
  if (!identity) return null;
  let { rows } = await db.query('SELECT * FROM fd_users WHERE identity_id = $1', [identity.id]);
  if (!rows.length && bootstrapId && identity.id === bootstrapId) {
    // Serialize first-administrator setup; email or user-editable metadata never grants roles.
    await db.query("SELECT pg_advisory_xact_lock(827461)");
    await db.query(`INSERT INTO fd_users(identity_id,email,name,role)
      SELECT $1,$2,$3,'super_admin' WHERE NOT EXISTS (SELECT 1 FROM fd_users WHERE role='super_admin')
      ON CONFLICT DO NOTHING`, [identity.id, email(identity.email, true), text(identity.name || identity.email, 'name', 150, true)]);
    ({ rows } = await db.query('SELECT * FROM fd_users WHERE identity_id = $1', [identity.id]));
  }
  const user = rows[0];
  if (!user || !user.active) throw new HttpError(403, 'Your Identity account has no active CRM access. Contact your administrator.');
  return user;
}
export async function audit(db, actor, action, target) {
  await db.query('INSERT INTO fd_audit(actor,action,target) VALUES($1,$2,$3)', [actor?.id ?? null, action, String(target)]);
}
export async function throttle(db, route, ip, maximum = 20) {
  const key = createHash('sha256').update(`${route}:${ip}`).digest('hex');
  const { rows } = await db.query(`INSERT INTO fd_rate_limits(key,count,expires_at) VALUES($1,1,now()+interval '1 minute')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN fd_rate_limits.expires_at <= now() THEN 1 ELSE fd_rate_limits.count+1 END,
    expires_at=CASE WHEN fd_rate_limits.expires_at <= now() THEN now()+interval '1 minute' ELSE fd_rate_limits.expires_at END RETURNING count`, [key]);
  if (rows[0].count > maximum) throw new HttpError(429, 'Too many requests. Wait a minute.');
  await db.query('DELETE FROM fd_rate_limits WHERE expires_at < now()');
}
async function teamIDs(db, actor, requested) {
  const result = ids(requested, 'teams');
  const { rows } = await db.query('SELECT id FROM fd_teams WHERE id=ANY($1::int[])', [result]);
  if (rows.length !== result.length) throw new HttpError(400, 'Unknown team.');
  requireAccess(administrator(actor) || result.every(id => actor.teams.includes(id)), 'Teams exceed your management scope.');
  return result;
}
async function assignments(db, actor, data, record) {
  const keys = ['owner', 'team', 'assigned_to', 'support_access'];
  if (!privileged(actor)) { requireAccess(!keys.some(key => key in data), 'Only administrators and managers can assign records.'); return; }
  if ('support_access' in data) {
    if (typeof data.support_access !== 'boolean') throw new HttpError(400, 'support_access must be boolean.');
    record.support_access = data.support_access;
  }
  for (const key of ['team', 'owner']) {
    if (!(key in data)) continue;
    if (data[key] !== null) ids([data[key]], key);
    record[key] = data[key];
  }
  if ('assigned_to' in data) record.assigned_to = ids(data.assigned_to, 'assigned_to');
  if (record.team !== null) {
    const found = await db.query('SELECT id FROM fd_teams WHERE id=$1', [record.team]);
    if (!found.rows.length) throw new HttpError(400, 'Unknown team.');
  }
  const people = [...new Set([record.owner, ...record.assigned_to].filter(Boolean))];
  const { rows } = await db.query('SELECT * FROM fd_users WHERE id=ANY($1::int[]) AND active', [people]);
  if (rows.length !== people.length) throw new HttpError(400, 'Unknown or inactive owner/assignee.');
  if (actor.role === 'manager') {
    requireAccess(actor.teams.includes(record.team), 'Managers can assign only their teams.');
    requireAccess(rows.every(user => user.teams.includes(record.team)), 'Owner and assignees must belong to the assigned team.');
  }
}
const recordColumns = ['id','kind','name','email','phone','company','message','source','status','details','owner','team','assigned_to','support_access'];
async function saveRecord(db, record, create) {
  const columns = create ? recordColumns : recordColumns.filter(key => !['id','kind'].includes(key));
  const values = columns.map(key => key === 'details' ? JSON.stringify(record[key]) : record[key]);
  const sql = create
    ? `INSERT INTO fd_records(${columns.join(',')}) VALUES(${columns.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`
    : `UPDATE fd_records SET ${columns.map((key,i) => key + '=$' + (i + 1)).join(',')},updated_at=now() WHERE id=$${values.length + 1} RETURNING *`;
  if (!create) values.push(record.id);
  return (await db.query(sql, values)).rows[0];
}
export async function capture(db, route, data, origin) {
  if (data.website) throw new HttpError(400, 'Submission rejected.');
  const fields = cleanFields(data, true);
  const ticket = route === 'support/capture';
  const record = { id: randomUUID(), kind: ticket ? 'ticket' : 'lead', name: fields.name, email: '', phone: '', company: '', message: '', source: origin || 'Website form', status: ticket ? 'Open' : 'New', details: {}, owner: null, team: null, assigned_to: [], support_access: ticket, ...fields };
  record.status = ticket ? 'Open' : 'New';
  if (ticket) {
    const priority = data.priority || 'Normal', category = data.category || 'Support';
    if (!['Low','Normal','High','Urgent'].includes(priority) || !['Support','Technical issue','Billing','General enquiry'].includes(category)) throw new HttpError(400, 'Invalid priority or category.');
    if (!record.message) throw new HttpError(400, 'Describe your support request.');
    record.details = { Requester: fields.name, Priority: priority, Category: category };
    record.name = text(data.subject, 'subject', 160, true);
  }
  await saveRecord(db, record, true);
  await audit(db, null, ticket ? 'support.captured' : 'lead.captured', record.id);
  return json({ id: record.id, ...(ticket ? { reference: 'FD-' + record.id.replaceAll('-', '').toUpperCase() } : {}), message: ticket ? 'Your support request has been received.' : 'Lead captured successfully.' }, 201);
}
export async function dispatch(db, actor, route, method, data, identityAdmin) {
  const teams = (await db.query('SELECT * FROM fd_teams ORDER BY name')).rows;
  const scope = visibilitySQL(actor);
  if (route === 'auth/session' && method === 'GET') return json({ user: userJSON(actor, teams), csrfToken: '', backend: 'netlify' });
  if (route === 'reports' && method === 'GET') {
    const { rows } = await db.query(`SELECT kind,count(*)::int AS count FROM fd_records WHERE ${scope.text} GROUP BY kind`, scope.values);
    return json({ counts: Object.fromEntries(kinds.map(kind => [kind, rows.find(row => row.kind === kind)?.count || 0])) });
  }
  if ((route === 'leads' || route.startsWith('records/')) && method === 'GET') {
    const kind = route === 'leads' ? 'lead' : route.slice(8);
    if (!kinds.includes(kind)) throw new HttpError(404, 'Unknown module.');
    const result = await db.query(`SELECT * FROM fd_records WHERE ${scope.text} AND kind=$${scope.values.length + 1} ORDER BY created_at DESC LIMIT 1000`, [...scope.values, kind]);
    return json({ [route === 'leads' ? 'leads' : 'records']: result.rows.map(recordJSON) });
  }
  if (route.startsWith('records/') && method === 'POST') {
    const kind = route.slice(8);
    if (!kinds.includes(kind)) throw new HttpError(404, 'Unknown module.');
    requireAccess(editable(actor, kind));
    const fields = cleanFields(data);
    if (!fields.name) throw new HttpError(400, 'Name is required.');
    const record = { id: randomUUID(), kind, name: fields.name, email: '', phone: '', company: '', message: '', source: '', status: 'New', details: {}, owner: actor.id, team: actor.role === 'manager' ? actor.teams[0] || null : null, assigned_to: [actor.id], support_access: actor.role === 'support', ...fields };
    await assignments(db, actor, data, record);
    const saved = await saveRecord(db, record, true);
    await audit(db, actor, 'record.created', record.id);
    return json({ record: recordJSON(saved) }, 201);
  }
  if (route.startsWith('record/')) {
    const id = route.slice(7);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new HttpError(404, 'Record not found.');
    const record = (await db.query(`SELECT * FROM fd_records WHERE ${scope.text} AND id=$${scope.values.length + 1} FOR UPDATE`, [...scope.values, id])).rows[0];
    if (!record) throw new HttpError(404, 'Record not found.');
    if (method === 'GET') return json({ record: recordJSON(record) });
    if (method === 'DELETE') {
      requireAccess(administrator(actor), 'Only administrators can delete records.');
      await db.query('DELETE FROM fd_records WHERE id=$1', [id]);
      await audit(db, actor, 'record.deleted', id);
      return json({ ok: true });
    }
    if (method === 'PATCH') {
      requireAccess(editable(actor, record.kind), 'This record is read-only for your role.');
      Object.assign(record, cleanFields(data));
      await assignments(db, actor, data, record);
      const saved = await saveRecord(db, record, false);
      await audit(db, actor, 'record.updated', id);
      return json({ record: recordJSON(saved) });
    }
  }
  if (route === 'teams') {
    if (method === 'GET') return json({ teams: administrator(actor) ? teams : teams.filter(team => actor.teams.includes(team.id)) });
    if (method === 'POST') {
      requireAccess(administrator(actor));
      const name = text(data.name, 'team name', 120, true);
      const team = (await db.query('INSERT INTO fd_teams(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING *', [name])).rows[0];
      await audit(db, actor, 'team.created', team.id);
      return json({ team }, 201);
    }
  }
  if (route === 'assignees' && method === 'GET') {
    requireAccess(privileged(actor));
    const users = (await db.query('SELECT * FROM fd_users WHERE active')).rows.filter(user => actor.role !== 'manager' || user.teams.some(id => actor.teams.includes(id)));
    return json({ users: users.map(user => userJSON(user, teams)) });
  }
  if (route === 'users' && method === 'GET') {
    const users = (await db.query('SELECT * FROM fd_users ORDER BY id')).rows.filter(user => manageable(actor, user));
    return json({ users: users.map(user => userJSON(user, teams)), roles: creatable[actor.role].map(value => ({ value, label: roles[value] })) });
  }
  if (route === 'users' && method === 'POST') {
    const role = data.role || 'support';
    requireAccess(creatable[actor.role].includes(role), 'Your role cannot create this account type.');
    const mail = email(data.email, true), name = text(data.name, 'name', 150, true);
    if (typeof data.password !== 'string' || data.password.length < 12 || data.password.length > 128) throw new HttpError(400, 'Use a password of 12 to 128 characters.');
    const membership = await teamIDs(db, actor, data.teams ?? (administrator(actor) ? [] : actor.teams));
    // Reserve the unique email before creating the external account; the transaction rolls back on failure.
    const candidate = (await db.query('INSERT INTO fd_users(email,name,role,teams,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [mail, name, role, membership, actor.id])).rows[0];
    const identity = await identityAdmin.createUser({ email: mail, password: data.password, data: { user_metadata: { full_name: name } } });
    try {
      candidate.identity_id = identity.id;
      await db.query('UPDATE fd_users SET identity_id=$1 WHERE id=$2', [identity.id, candidate.id]);
      await audit(db, actor, 'user.created', candidate.id);
    } catch (error) {
      await identityAdmin.deleteUser(identity.id).catch(() => {});
      throw error;
    }
    return json({ user: userJSON(candidate, teams) }, 201);
  }
  if (/^users\/\d+$/.test(route) && method === 'PATCH') {
    const target = (await db.query('SELECT * FROM fd_users WHERE id=$1 FOR UPDATE', [Number(route.slice(6))])).rows[0];
    if (!target) throw new HttpError(404, 'User not found.');
    requireAccess(target.id !== actor.id, 'You cannot change your own access.');
    requireAccess(manageable(actor, target), 'User is outside your management scope.');
    const role = data.role ?? target.role;
    requireAccess(creatable[actor.role].includes(role), 'Role escalation is not allowed.');
    if ('active' in data && typeof data.active !== 'boolean') throw new HttpError(400, 'active must be boolean.');
    const membership = await teamIDs(db, actor, data.teams ?? target.teams);
    const saved = (await db.query('UPDATE fd_users SET role=$1,active=$2,teams=$3 WHERE id=$4 RETURNING *', [role, data.active ?? target.active, membership, target.id])).rows[0];
    await audit(db, actor, 'user.updated', target.id);
    return json({ user: userJSON(saved, teams) });
  }
  if (route === 'system' && method === 'GET') {
    requireAccess(actor.role === 'super_admin');
    const events = (await db.query('SELECT action,target,created_at FROM fd_audit ORDER BY created_at DESC LIMIT 100')).rows;
    return json({ roles, leadFormOrigins: (process.env.LEAD_FORM_ORIGINS || '').split(',').filter(Boolean), audit: events });
  }
  throw new HttpError(405, 'Endpoint or method not supported.');
}
