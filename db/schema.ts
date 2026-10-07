import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const teams = pgTable('crm_teams', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
});

export const users = pgTable('crm_users', {
  id: serial('id').primaryKey(),
  identityId: text('identity_id').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  role: text('role').notNull().default('support'),
  active: boolean('active').notNull().default(true),
  teams: jsonb('teams').$type<number[]>().notNull().default([]),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const records = pgTable('crm_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull().default(''),
  phone: text('phone').notNull().default(''),
  company: text('company').notNull().default(''),
  message: text('message').notNull().default(''),
  source: text('source').notNull().default(''),
  status: text('status').notNull().default('New'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  owner: integer('owner').references(() => users.id, { onDelete: 'set null' }),
  team: integer('team').references(() => teams.id, { onDelete: 'set null' }),
  assignedTo: jsonb('assigned_to').$type<number[]>().notNull().default([]),
  supportAccess: boolean('support_access').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('crm_records_kind_idx').on(table.kind), index('crm_records_team_idx').on(table.team)]);

export const auditEvents = pgTable('crm_audit_events', {
  id: serial('id').primaryKey(),
  actor: integer('actor').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  target: text('target').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable('crm_rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(1),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
