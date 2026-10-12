import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { applyOperation, reconcile } from '../domain/operations';
import { createSeed, ALICE, BOB, CAROL } from '../domain/seed';
import { findMatches } from '../domain/matching';
import type { State } from '../domain/types';
export const FIXED_NOW = 1790780000;
export function makeDatabase(path = ':memory:', initial?: State) {
  const db = new DatabaseSync(path), clock = { now: FIXED_NOW };
  db.function('unixepoch', { varargs: true }, () => clock.now);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  const seed = initial ?? createSeed(clock.now);
  db.prepare("INSERT INTO communities(id,mode,state) VALUES('campus','demo',?)").run(JSON.stringify(seed));
  const snapshot = () => {
    const row = db.prepare("SELECT state,revision,unixepoch() AS now FROM communities WHERE id='campus'").get() as { state: string; revision: number; now: number };
    return { ...row, state: JSON.parse(row.state) as State };
  };
  const commit = (state: State, actorId: string, operation: string, revision = snapshot().revision, now = clock.now) => db.prepare("UPDATE communities SET state=?,revision=revision+1,actor_id=?,operation=?,operation_id=?,updated_at=unixepoch() WHERE id='campus' AND revision=? AND unixepoch()=? RETURNING revision").get(JSON.stringify(state), actorId, operation, crypto.randomUUID(), revision, now);
  const act = (actorId: string, operation: string, input: unknown) => {
    const snap = snapshot();
    const result = applyOperation(snap.state, actorId, operation, input, snap.now, crypto.randomUUID());
    const committed = commit(snap.state, actorId, operation, snap.revision, snap.now);
    if (!committed) throw new Error('CAS failed');
    return result as { loopId: string; state: string };
  };
  const runReconcile = () => { const s = snapshot(); reconcile(s.state, s.now, crypto.randomUUID()); return commit(s.state, 'system', 'reconcile', s.revision, s.now); };
  return { db, clock, snapshot, commit, act, runReconcile, close: () => db.close() };
}
export function proposeMain(database: ReturnType<typeof makeDatabase>) {
  const s = database.snapshot();
  const c = findMatches(s.state, ALICE, s.state.listings.filter(l => l.ownerId === ALICE).map(l => l.id), s.now).candidates[0];
  return database.act(ALICE, 'loop.propose', { listingIds: c.listingIds, snapshots: c.participants.map(({ userId, listingVersion, memberVersion, preferenceVersion }) => ({ userId, listingVersion, memberVersion, preferenceVersion })), option: c.options[0], accepted: true }).loopId;
}
export function confirmMain(database: ReturnType<typeof makeDatabase>) {
  const id = proposeMain(database);
  database.act(BOB, 'loop.vote', { id, expectedVersion: 1, vote: 'accept' });
  database.act(CAROL, 'loop.vote', { id, expectedVersion: 1, vote: 'accept' });
  return id;
}
