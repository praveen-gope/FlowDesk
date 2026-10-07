export const roles = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  sales: 'Sales Executive',
  support: 'Support/User',
} as const;

export type Role = keyof typeof roles;
export type Actor = { id: number; role: string; teams: number[]; createdBy?: number | null };
export type ScopedRecord = { kind: string; owner: number | null; team: number | null; assignedTo: number[]; supportAccess: boolean };

export const kinds = ['lead', 'ticket', 'contact', 'company', 'deal', 'task', 'communication', 'note', 'document', 'product', 'invoice'];
export const salesKinds = ['lead', 'contact', 'company', 'deal', 'task', 'communication'];
export const supportKinds = ['contact', 'task', 'communication', 'note', 'document', 'ticket'];
export const creatableRoles: Record<Role, Role[]> = {
  super_admin: ['super_admin', 'admin', 'manager', 'sales', 'support'],
  admin: ['manager', 'sales', 'support'],
  manager: ['manager', 'sales', 'support'],
  sales: ['support'],
  support: ['support'],
};

export function isRole(role: unknown): role is Role {
  return typeof role === 'string' && Object.hasOwn(roles, role);
}

export function isAdministrator(actor: Actor) {
  return actor.role === 'super_admin' || actor.role === 'admin';
}

export function canView(actor: Actor, record: ScopedRecord) {
  if (isAdministrator(actor)) return true;
  if (actor.role === 'manager') return record.team !== null && actor.teams.includes(record.team);
  if (actor.role === 'sales') return salesKinds.includes(record.kind) && (record.owner === actor.id || record.assignedTo.includes(actor.id));
  return actor.role === 'support' && record.supportAccess && supportKinds.includes(record.kind) && record.assignedTo.includes(actor.id);
}

export function canEdit(actor: Actor, kind: string) {
  if (isAdministrator(actor)) return true;
  if (actor.role === 'manager') return kind !== 'product' && kind !== 'invoice';
  if (actor.role === 'sales') return salesKinds.includes(kind);
  return actor.role === 'support' && ['note', 'task', 'document', 'ticket'].includes(kind);
}

export function canManage(actor: Actor, target: Actor) {
  if (!isRole(actor.role) || !isRole(target.role)) return false;
  if (!creatableRoles[actor.role].includes(target.role)) return false;
  if (isAdministrator(actor)) return true;
  if (actor.role === 'manager') {
    return target.teams.every(team => actor.teams.includes(team)) &&
      (target.createdBy === actor.id || (['sales', 'support'].includes(target.role) && target.teams.some(team => actor.teams.includes(team))));
  }
  return target.createdBy === actor.id;
}

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function integerIds(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some(item => !Number.isSafeInteger(item) || item <= 0)) {
    throw new ApiError(`${label} must contain positive integer IDs.`);
  }
  return [...new Set(value as number[])];
}

export function cleanFields(data: Record<string, unknown>, capture = false) {
  const limits = { name: 160, email: 254, phone: 40, company: 160, message: 4000, source: 200, status: 40 };
  const result: Partial<Record<keyof typeof limits, string>> = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (!Object.hasOwn(data, key)) continue;
    const value = data[key];
    if (typeof value !== 'string' || value.trim().length > limit) throw new ApiError(`Invalid ${key}. Maximum length: ${limit}.`);
    result[key as keyof typeof limits] = value.trim();
  }
  if (result.name === '') throw new ApiError('Name is required.');
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new ApiError('A valid email is required.');
  if (capture && (!result.name || !result.email)) throw new ApiError('Name and valid email are required.');
  return result;
}

export async function payload(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new ApiError('Send application/json.');
  if (Number(request.headers.get('content-length')) > 16384) throw new ApiError('Request is too large.', 413);
  if (!request.body) throw new ApiError('Send a JSON object.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 16384) {
      await reader.cancel();
      throw new ApiError('Request is too large.', 413);
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError('Send valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ApiError('Send a JSON object.');
  return data;
}
