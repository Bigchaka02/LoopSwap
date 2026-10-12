import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, primaryKey, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
export const communities = sqliteTable('communities', {
  id: text('id').primaryKey(), mode: text('mode').notNull(), revision: integer('revision').notNull().default(0),
  state: text('state').notNull(), actorId: text('actor_id').notNull().default('system'),
  operation: text('operation').notNull().default('seed'), operationId: text('operation_id').notNull().default('seed'), updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
}, t => [check('state_valid', sql`json_valid(${t.state}) AND length(${t.state}) < 1500000`), check('mode_valid', sql`${t.mode} IN ('demo','pilot') AND json_extract(${t.state}, '$.mode') IS ${t.mode}`)]);
export const itemHolds = sqliteTable('item_holds', {
  communityId: text('community_id').notNull().references(() => communities.id), listingId: text('listing_id').notNull(), loopId: text('loop_id').notNull(), createdAt: integer('created_at').notNull(),
}, t => [primaryKey({ columns: [t.communityId, t.listingId] })]);
export const loanItemHolds = sqliteTable('loan_item_holds', {
  communityId: text('community_id').notNull().references(() => communities.id), listingId: text('listing_id').notNull(), loanId: text('loan_id').notNull(), createdAt: integer('created_at').notNull(),
}, t => [primaryKey({ columns: [t.communityId, t.listingId] })]);
export const participantHolds = sqliteTable('participant_holds', {
  communityId: text('community_id').notNull().references(() => communities.id), userId: text('user_id').notNull(), loopId: text('loop_id').notNull(), createdAt: integer('created_at').notNull(),
}, t => [primaryKey({ columns: [t.communityId, t.userId] })]);
export const activeProposals = sqliteTable('active_proposals', {
  communityId: text('community_id').notNull().references(() => communities.id), loopId: text('loop_id').notNull(), canonicalKey: text('canonical_key').notNull(),
}, t => [primaryKey({ columns: [t.communityId, t.loopId] }), uniqueIndex('active_cycle_unique').on(t.communityId, t.canonicalKey)]);
export const loopEvents = sqliteTable('loop_events', { id: text('id').primaryKey(), communityId: text('community_id').notNull().references(() => communities.id), payload: text('payload').notNull(), createdAt: integer('created_at').notNull() });
export const notificationOutbox = sqliteTable('notification_outbox', { id: text('id').primaryKey(), eventId: text('event_id').notNull().references(() => loopEvents.id), recipientId: text('recipient_id').notNull(), payload: text('payload').notNull(), status: text('status').notNull().default('delivered') }, t => [uniqueIndex('outbox_event_recipient').on(t.eventId, t.recipientId)]);
export const sessions = sqliteTable('demo_sessions', { tokenHash: text('token_hash').primaryKey(), memberId: text('member_id').notNull(), communityId: text('community_id').notNull().references(() => communities.id), expiresAt: integer('expires_at').notNull(), createdAt: integer('created_at').notNull().default(sql`(unixepoch())`) });
export const identities = sqliteTable('platform_identities', { platformId: text('platform_id').primaryKey(), memberId: text('member_id').notNull().unique(), communityId: text('community_id').notNull().references(() => communities.id) });
export const photoUploads = sqliteTable('photo_uploads', {
  id: text('id').primaryKey(),
  communityId: text('community_id').notNull().references(() => communities.id),
  ownerId: text('owner_id').notNull(),
  objectKey: text('object_key').notNull().unique(),
  inputHash: text('input_hash').notNull(),
  state: text('state').notNull().default('staged'),
  cleanupAt: integer('cleanup_at').notNull().default(0),
  byteSize: integer('byte_size').notNull(),
  width: integer('width').notNull(), height: integer('height').notNull(),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, t => [
  index('photo_owner_created_idx').on(t.ownerId, t.createdAt),
  index('photo_gc_idx').on(t.state, t.cleanupAt, t.createdAt),
  check('photo_state', sql`${t.state} IN ('staged','ready','deleting','deleted')`),
  check('photo_dimensions', sql`${t.width} BETWEEN 1 AND 900 AND ${t.height} BETWEEN 1 AND 900`),
  check('photo_bytes', sql`${t.byteSize} BETWEEN 1 AND 1000000`),
]);
