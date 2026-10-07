export const roles = { super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager', sales: 'Sales Executive', support: 'Support/User' };
export const creatable = { super_admin: Object.keys(roles), admin: ['manager', 'sales', 'support'], manager: ['manager', 'sales', 'support'], sales: ['support'], support: ['support'] };
export const kinds = ['lead', 'ticket', 'contact', 'company', 'deal', 'task', 'communication', 'note', 'document', 'product', 'invoice'];
const salesKinds = ['lead', 'contact', 'company', 'deal', 'task', 'communication'];
const supportKinds = ['contact', 'task', 'communication', 'note', 'document', 'ticket'];
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const requireAccess = (condition, message = 'Permission denied.') => { if (!condition) throw new HttpError(403, message); };
export const privileged = user => ['super_admin', 'admin', 'manager'].includes(user.role);
export const administrator = user => ['super_admin', 'admin'].includes(user.role);
export function editable(user, kind) {
  if (administrator(user)) return true;
  if (user.role === 'manager') return !['product', 'invoice'].includes(kind);
  return (user.role === 'sales' ? salesKinds : ['note', 'task', 'document', 'ticket']).includes(kind);
}
export function visible(user, record) {
  if (administrator(user)) return true;
  if (user.role === 'manager') return user.teams.includes(record.team);
  if (user.role === 'sales') return salesKinds.includes(record.kind) && (record.owner === user.id || record.assigned_to.includes(user.id));
  return record.support_access && supportKinds.includes(record.kind) && record.assigned_to.includes(user.id);
}
export function visibilitySQL(user, offset = 1) {
  if (administrator(user)) return { text: 'TRUE', values: [] };
  if (user.role === 'manager') return { text: `team = ANY($${offset}::int[])`, values: [user.teams] };
  if (user.role === 'sales') return { text: `(owner = $${offset} OR $${offset} = ANY(assigned_to)) AND kind = ANY($${offset + 1}::text[])`, values: [user.id, salesKinds] };
  return { text: `$${offset} = ANY(assigned_to) AND support_access AND kind = ANY($${offset + 1}::text[])`, values: [user.id, supportKinds] };
}
export function manageable(actor, target) {
  if (actor.role === 'super_admin') return true;
  if (!creatable[actor.role]?.includes(target.role)) return false;
  if (actor.role === 'admin') return true;
  if (actor.role === 'manager') return target.teams.every(id => actor.teams.includes(id)) && (target.created_by === actor.id || (['sales', 'support'].includes(target.role) && target.teams.some(id => actor.teams.includes(id))));
  return target.created_by === actor.id;
}
export function text(value, field, maximum, required = false) {
  if (typeof value !== 'string' || value.trim().length > maximum || (required && !value.trim())) throw new HttpError(400, `Invalid ${field}. Maximum length: ${maximum}.`);
  return value.trim();
}
export function email(value, required = false) {
  value = text(value, 'email', 254, required).toLowerCase();
  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new HttpError(400, 'Invalid email.');
  return value;
}
export function ids(value, field) {
  if (!Array.isArray(value) || value.length > 100 || value.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) throw new HttpError(400, `${field} must contain valid integer IDs.`);
  return [...new Set(value)];
}
export function cleanFields(data, capture = false) {
  const fields = {};
  for (const [key, maximum] of Object.entries({ name: 160, email: 254, phone: 40, company: 160, message: 4000, source: 200, status: 40 })) {
    if (key in data) fields[key] = key === 'email' ? email(data[key]) : text(data[key], key, maximum, key === 'name');
  }
  if (capture && (!fields.name || !fields.email)) throw new HttpError(400, 'Name and valid email are required.');
  if ('details' in data && !capture) {
    if (!data.details || typeof data.details !== 'object' || Array.isArray(data.details)) throw new HttpError(400, 'details must be an object.');
    fields.details = data.details;
  }
  return fields;
}
