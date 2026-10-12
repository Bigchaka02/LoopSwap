import { env } from 'cloudflare:workers';
import { DomainError, applyOperation, requireMember, reconcile, visibleLoop } from '../domain/operations';
import { visibleLoan } from '../domain/loans';
import { visibleReview } from '../domain/reputation';
import { createSeed } from '../domain/seed';
import { validateListingPhoto } from './photos';
import type { Snapshot, State } from '../domain/types';
export function rawDb(): D1Database {
  if (!env.DB) throw new DomainError('RETRYABLE_DATABASE', 'The campus database is temporarily unavailable. Please try again.', 503);
  return env.DB;
}
export function appMode() { return env.LOOPSWAP_MODE === 'demo' ? 'demo' : 'pilot'; }
export async function readSnapshot(): Promise<Snapshot | null> {
  const row = await rawDb().prepare("SELECT state, revision, unixepoch() AS now FROM communities WHERE id='campus'").first<{ state: string; revision: number; now: number }>();
  return row ? { state: JSON.parse(row.state) as State, revision: row.revision, now: row.now } : null;
}
export async function initializeDemo(): Promise<void> {
  if (appMode() !== 'demo') throw new DomainError('NOT_FOUND', 'This action is unavailable.', 404);
  const clock = await rawDb().prepare('SELECT unixepoch() AS now').first<{ now: number }>();
  const seed = createSeed(clock!.now);
  await rawDb().prepare("INSERT INTO communities(id,mode,state) VALUES('campus','demo',?) ON CONFLICT(id) DO NOTHING").bind(JSON.stringify(seed)).run();
}
export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v)).join(',') + '}';
  return JSON.stringify(value);
}
export async function mutate(actorId: string, operation: string, input: unknown, key: string): Promise<{ data: unknown; serverTime: number; operationId: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) throw new DomainError('VALIDATION', 'A UUID idempotency key is required.');
  const hash = await sha256(canonicalJson(input));
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await readSnapshot();
    if (!snapshot) throw new DomainError('NOT_FOUND', 'This campus has not been configured.', 404);
    const { state, revision, now } = snapshot;
    const actor = requireMember(state, actorId);
    if (operation.startsWith('moderation.') && actor.role !== 'moderator') throw new DomainError('FORBIDDEN', 'Moderator access is required.', 403);
    if (operation.startsWith('loop.') && operation !== 'loop.propose' && input && typeof input === 'object' && 'id' in input) visibleLoop(state, String(input.id), actorId);
    if ((operation.startsWith('loan.') && operation !== 'loan.request' || operation === 'moderation.loan.resolve') && input && typeof input === 'object' && 'id' in input) visibleLoan(state, String(input.id), actorId);
    if (['review.dispute', 'moderation.review.resolve'].includes(operation) && input && typeof input === 'object' && 'id' in input) visibleReview(state, String(input.id), actorId);
    const previous = state.idempotency.find(k => k.actorId === actorId && k.operation === operation && k.key === key && k.at > now - 172800);
    if (previous) {
      if (previous.hash !== hash) throw new DomainError('CONFLICT', 'This request key was already used for different details.', 409);
      return { data: previous.result, serverTime: now, operationId: key };
    }
    if (operation === 'listing.save') await validateListingPhoto(state, actorId, input);
    const data = applyOperation(state, actorId, operation, input, now, key);
    state.idempotency.push({ actorId, operation, key, hash, result: data, at: now });
    const stateJson = JSON.stringify(state);
    const bytes = new TextEncoder().encode(stateJson).byteLength;
    const recovery = ['loop.receipt','loop.cancel','loop.problem','moderation.resolve','loan.pickup','loan.return.report','loan.return','loan.close','loan.cancel','loan.problem','loan.extension.vote','moderation.loan.resolve','review.submit','review.dispute','moderation.review.resolve'].includes(operation);
    if (bytes > (recovery ? 1400000 : 600000)) throw new DomainError('RATE_LIMITED', 'This demo campus needs history archiving before accepting more activity. Capacity is reserved for current handoffs and review.', 429);
    try {
      const committed = await rawDb().prepare("UPDATE communities SET state=?, revision=revision+1, actor_id=?, operation=?, operation_id=?, updated_at=unixepoch() WHERE id='campus' AND revision=? AND unixepoch()=? RETURNING revision").bind(stateJson, actorId, operation, key, revision, now).first<{ revision: number }>();
      if (committed) return { data, serverTime: now, operationId: key };
    } catch (error) {
      if (!/busy|locked|temporar|network/i.test(String(error))) { console.error('LoopSwap mutation failed', { operation, code: 'DATABASE_CONSTRAINT' }); throw new DomainError('RETRYABLE_DATABASE', 'The exchange could not be saved. Reload and try again; no partial reservation was kept.', 503); }
    }
  }
  throw new DomainError('RETRYABLE_DATABASE', 'The campus changed while saving. Reload and try again.', 503);
}
export async function reconcileDatabase(): Promise<Snapshot | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await readSnapshot(); if (!snapshot) return null;
    const before = JSON.stringify(snapshot.state), operationId = crypto.randomUUID();
    reconcile(snapshot.state, snapshot.now, operationId);
    if (before === JSON.stringify(snapshot.state)) return snapshot;
    const committed = await rawDb().prepare("UPDATE communities SET state=?, revision=revision+1, actor_id='system', operation='reconcile', operation_id=?, updated_at=unixepoch() WHERE id='campus' AND revision=? AND unixepoch()=? RETURNING revision").bind(JSON.stringify(snapshot.state), operationId, snapshot.revision, snapshot.now).first();
    if (committed) return { ...snapshot, revision: snapshot.revision + 1 };
  }
  throw new DomainError('RETRYABLE_DATABASE', 'Reconciliation needs a retry.', 503);
}
