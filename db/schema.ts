import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  phone: text('phone').notNull(),
  country: text('country').notNull(),
  city: text('city').notNull().default(''),
  consent: integer('consent', { mode: 'boolean' }).notNull(),
  consentVersion: text('consent_version').notNull(),
  consentedAt: integer('consented_at').notNull(),
  status: text('status').notNull().default('new'),
  notes: text('notes').notNull().default(''),
  source: text('source').notNull().default('landing-page'),
  referrerCode: text('referrer_code').notNull().default('eePfC6mw'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('leads_created_idx').on(table.createdAt), index('leads_status_idx').on(table.status), index('leads_email_idx').on(table.email)]);

export const leadRateLimits = sqliteTable('lead_rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(1),
  expiresAt: integer('expires_at').notNull(),
});

export const crmAccess = sqliteTable('crm_access', {
  email: text('email').primaryKey(),
  role: text('role').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
