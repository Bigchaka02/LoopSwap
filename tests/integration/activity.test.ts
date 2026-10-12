import { afterEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, CAROL, MODERATOR, createSeed } from '../../domain/seed';
import { activityTasks } from '../../domain/activity';
import { feedbackOpportunities } from '../../domain/reputation';
import { bootstrapDto } from '../../server/dto';
import { FIXED_NOW, confirmMain, makeDatabase } from '../helpers';
const open: ReturnType<typeof makeDatabase>[] = [];
afterEach(() => open.splice(0).forEach(d => d.close()));
function resolvedTrade() {
  const d = makeDatabase(); open.push(d);
  const id = confirmMain(d);
  d.act(BOB, 'loop.problem', { id, kind: 'other', details: 'The fictional participants did not exchange the items.' });
  const loop = d.snapshot().state.loops.find(l => l.id === id)!;
  d.act(MODERATOR, 'moderation.resolve', { id, expectedVersion: loop.version, expectedSequence: loop.sequence, outcomes: loop.transfers.map(t => ({ listingId: t.listingId, outcome: 'original_owner' })), reason: 'Each participant confirmed that they retained their own item.' });
  return { d, id };
}
describe('authoritative feedback reminders and listing readiness', () => {
  it('offers feedback without invented receipts, only to the direct participants', () => {
    const { d, id } = resolvedTrade(), snapshot = d.snapshot();
    expect(snapshot.state.loops.find(l => l.id === id)!.transfers.every(t => !t.receipt)).toBe(true);
    for (const actor of [ALICE, BOB, CAROL]) {
      const dto = bootstrapDto(snapshot.state, actor, snapshot.now);
      expect(dto.feedbackOpportunities).toEqual([{ kind: 'trade', referenceId: id, closesAt: snapshot.now + 604800 }]);
      expect(activityTasks(dto).filter(t => t.kind === 'feedback')).toHaveLength(1);
    }
    expect(bootstrapDto(snapshot.state, MODERATOR, snapshot.now).feedbackOpportunities).toEqual([]);
    expect((d.db.prepare('SELECT count(*) AS n FROM item_holds').get() as { n: number }).n).toBe(0);
  });
  it('uses the server’s closure deadline even if later non-closure events appear', () => {
    const { d, id } = resolvedTrade(), state = d.snapshot().state;
    state.events.push({ id: crypto.randomUUID(), loopId: id, actorId: MODERATOR, kind: 'annotation', at: FIXED_NOW + 86400, operationId: crypto.randomUUID(), message: 'A later annotation must not extend feedback consent.' });
    expect(feedbackOpportunities(state, ALICE, FIXED_NOW + 604800)[0].closesAt).toBe(FIXED_NOW + 604800);
    expect(feedbackOpportunities(state, ALICE, FIXED_NOW + 604801)).toEqual([]);
  });
  it('removes a submitted assessment reminder regardless of eventual publication or exclusion', () => {
    const { d, id } = resolvedTrade(), incoming = d.snapshot().state.loops.find(l => l.id === id)!.transfers.find(t => t.receiverId === ALICE)!;
    d.act(ALICE, 'review.submit', { kind: 'trade', referenceId: id, transferId: incoming.id, answers: { availability: 'yes', condition: 'unknown', commitment: 'unknown' }, note: '' });
    const snapshot = d.snapshot(); expect(bootstrapDto(snapshot.state, ALICE, snapshot.now).feedbackOpportunities).toEqual([]);
    expect(bootstrapDto(snapshot.state, BOB, snapshot.now).feedbackOpportunities).toHaveLength(1);
    snapshot.state.reviews![0].status = 'excluded'; expect(feedbackOpportunities(snapshot.state, ALICE, snapshot.now)).toEqual([]);
  });
  it('accepts feedback at exactly seven days and rejects it one second later', () => {
    const { d, id } = resolvedTrade(), loop = d.snapshot().state.loops.find(l => l.id === id)!;
    const submit = (actor: string) => ({ kind: 'trade', referenceId: id, transferId: loop.transfers.find(t => t.receiverId === actor)!.id, answers: { availability: 'unknown', condition: 'unknown', commitment: 'unknown' }, note: '' });
    d.clock.now = FIXED_NOW + 604800; d.act(ALICE, 'review.submit', submit(ALICE));
    d.clock.now++; expect(() => d.act(BOB, 'review.submit', submit(BOB))).toThrow('seven days');
  });
  it('rejects publication when every selected venue is inactive while still allowing a private draft', () => {
    const seed = createSeed(FIXED_NOW); seed.venues.forEach(v => { v.active = false; });
    const d = makeDatabase(':memory:', seed); open.push(d);
    const item = seed.listings[0], payload = { title: 'A useful new item', description: 'A private fixture draft.', categoryId: item.categoryId, catalogId: item.catalogId, condition: item.condition, wants: item.wants.map(({ mode, categoryId, catalogId, minCondition, priority }) => ({ mode, ...(categoryId ? { categoryId } : {}), ...(catalogId ? { catalogId } : {}), minCondition, priority })), ownershipConfirmed: true };
    expect(() => d.act(ALICE, 'listing.save', { ...payload, publish: true })).toThrow('active approved venue');
    d.act(ALICE, 'listing.save', { ...payload, publish: false });
    expect(activityTasks(bootstrapDto(d.snapshot().state, ALICE, d.clock.now)).some(t => t.kind === 'account')).toBe(true);
  });
});
