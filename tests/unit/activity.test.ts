import { describe, expect, it } from 'vitest';
import { activityTasks, meetupReadiness, type ActivitySnapshot } from '../../domain/activity';
import { ALICE, BOB, CAROL, MODERATOR, createSeed, fixtureId } from '../../domain/seed';
import { applyOperation } from '../../domain/operations';
import { findMatches } from '../../domain/matching';
import { bootstrapDto } from '../../server/dto';
import type { Loan } from '../../domain/types';
const now = 1790780000;
function data(actorId = ALICE) { return bootstrapDto(createSeed(now), actorId, now); }
function loan(state: Loan['state'] = 'REQUESTED'): Loan {
  const item = data().listings[0], pickup = { venueId: 'library', start: now + 9000, end: now + 10800 };
  return { id: fixtureId(901), listingId: item.id, item, lenderId: ALICE, borrowerId: BOB, pickup, returnSlot: { ...pickup, start: pickup.start + 86400, end: pickup.end + 86400 }, createdAt: now, deadline: now + 3600, memberVersions: [1, 1], preferenceVersions: [1, 1], state, version: 1, sequence: 1, custody: 'owner', extensions: [], issues: [] };
}
function loanData(actorId = ALICE, state: Loan['state'] = 'REQUESTED') { const result = data(actorId); result.loans.push(loan(state)); return result; }
function ownLoan(snapshot: ActivitySnapshot) { return activityTasks(snapshot).filter(t => t.kind === 'loan'); }
function trade() {
  const state = createSeed(now), c = findMatches(state, ALICE, [fixtureId(101)], now).candidates[0];
  applyOperation(state, ALICE, 'loop.propose', { listingIds: c.listingIds, snapshots: c.participants.map(({ userId, listingVersion, memberVersion, preferenceVersion }) => ({ userId, listingVersion, memberVersion, preferenceVersion })), option: c.options[0], accepted: true }, now, crypto.randomUUID());
  return state;
}
describe('private activity and responsibility reminders', () => {
  it('has no duties for anonymous, inactive, or observer moderator accounts', () => {
    const snapshot = loanData(MODERATOR);
    expect(ownLoan(snapshot)).toEqual([]);
    expect(activityTasks({ ...snapshot, actor: null })).toEqual([]);
    expect(activityTasks({ ...snapshot, actor: { ...snapshot.actor, status: 'suspended' } })).toEqual([]);
    const state = trade(); expect(activityTasks(bootstrapDto(state, MODERATOR, now)).filter(t => t.kind === 'trade')).toEqual([]);
  });
  it('distinguishes a pending trade vote from the initiator’s recorded consent and expires at equality', () => {
    const state = trade(), id = state.loops[0].id;
    expect(activityTasks(bootstrapDto(state, BOB, now)).find(t => t.id === `trade:${id}`)?.phase).toBe('now');
    expect(activityTasks(bootstrapDto(state, ALICE, now)).find(t => t.id === `trade:${id}`)?.phase).toBe('waiting');
    expect(activityTasks(bootstrapDto(state, BOB, state.loops[0].deadline)).filter(t => t.kind === 'trade')).toEqual([]);
  });
  it('opens only the actor’s own trade receipt at ten minutes before the meetup', () => {
    const state = trade(), loop = state.loops[0]; loop.state = 'CONFIRMED';
    expect(activityTasks(bootstrapDto(state, BOB, loop.start - 601)).find(t => t.kind === 'trade')?.phase).toBe('upcoming');
    expect(activityTasks(bootstrapDto(state, BOB, loop.start - 600)).find(t => t.kind === 'trade')?.title).toBe('Record your own receipt');
    const incoming = loop.transfers.find(t => t.receiverId === BOB)!;
    incoming.receipt = { recipientId: BOB, receivedAt: loop.start, note: '' };
    expect(activityTasks(bootstrapDto(state, BOB, loop.end + 1)).find(t => t.kind === 'trade')?.phase).toBe('waiting');
    expect(activityTasks(bootstrapDto(state, ALICE, loop.end + 1)).find(t => t.kind === 'trade')?.overdue).toBe(true);
  });
  it('makes borrowing approval lender-only and suppresses expired request tasks', () => {
    const lender = loanData(), borrower = loanData(BOB);
    expect(ownLoan(lender)[0].phase).toBe('now'); expect(ownLoan(borrower)[0].phase).toBe('waiting');
    expect(ownLoan({ ...lender, serverTime: lender.loans[0].deadline })).toEqual([]);
  });
  it('respects the pickup opening boundary and never asks a lender to record borrower pickup', () => {
    const borrower = loanData(BOB, 'RESERVED'), lender = loanData(ALICE, 'RESERVED');
    borrower.serverTime = borrower.loans[0].pickup.start - 601; expect(ownLoan(borrower)[0].phase).toBe('upcoming');
    borrower.serverTime++; expect(ownLoan(borrower)[0].phase).toBe('now');
    lender.serverTime = borrower.serverTime; expect(ownLoan(lender)[0].phase).toBe('waiting');
  });
  it('keeps a borrower return report waiting and asks only the lender to acknowledge it', () => {
    const borrower = loanData(BOB, 'RETURN_REPORTED'), lender = loanData(ALICE, 'RETURN_REPORTED');
    for (const snapshot of [borrower, lender]) { snapshot.loans[0].returnReportedAt = now; snapshot.serverTime = snapshot.loans[0].returnSlot.end + 1; }
    expect(ownLoan(borrower)[0].phase).toBe('waiting'); expect(ownLoan(borrower)[0].overdue).toBe(false);
    expect(ownLoan(lender)[0].phase).toBe('now'); expect(ownLoan(lender)[0].title).toBe('Receive the item back');
  });
  it('uses accepted return extensions and keeps pending ones separate from the due plan', () => {
    const snapshot = loanData(ALICE, 'ON_LOAN'), item = snapshot.loans[0], original = item.returnSlot;
    item.extensions.push({ id: fixtureId(902), requestedAt: now, status: 'accepted', returnSlot: { ...original, start: original.start + 86400, end: original.end + 86400 } });
    item.extensions.push({ id: fixtureId(903), requestedAt: now, status: 'pending', returnSlot: { ...original, start: original.start + 2 * 86400, end: original.end + 2 * 86400 } });
    snapshot.serverTime = original.end + 1;
    const tasks = ownLoan(snapshot); expect(tasks).toHaveLength(2);
    expect(tasks.find(t => t.id.startsWith('extension:'))?.phase).toBe('now');
    expect(tasks.find(t => t.id.startsWith('loan:'))?.at).toBe(original.start + 86400);
    expect(tasks.find(t => t.id.startsWith('loan:'))?.overdue).toBe(false);
    snapshot.serverTime = original.start + 86400; expect(ownLoan(snapshot).some(t => t.id.startsWith('extension:'))).toBe(false);
  });
  it('does not surface lingering extension decisions after return or review', () => {
    for (const state of ['RETURN_REPORTED', 'RETURNED', 'NEEDS_REVIEW'] as const) {
      const snapshot = loanData(ALICE, state); snapshot.loans[0].extensions.push({ id: fixtureId(904), status: 'pending', requestedAt: now, returnSlot: snapshot.loans[0].returnSlot });
      expect(ownLoan(snapshot).some(t => t.id.startsWith('extension:'))).toBe(false);
    }
  });
  it('requires both receipts and no issue before suggesting lender inspection and closure', () => {
    const snapshot = loanData(ALICE, 'RETURNED'), item = snapshot.loans[0];
    expect(ownLoan(snapshot)[0].phase).toBe('waiting');
    item.pickupReceipt = { recipientId: BOB, reportedAt: now, note: '' }; item.returnReceipt = { recipientId: ALICE, reportedAt: now, note: '' };
    expect(ownLoan(snapshot)[0].phase).toBe('now');
    item.issues.push({ id: fixtureId(905), authorId: ALICE, createdAt: now, details: 'Reported issue' }); expect(ownLoan(snapshot)[0].phase).toBe('waiting');
    expect(ownLoan({ ...snapshot, actor: data(BOB).actor })[0].phase).toBe('waiting');
  });
  it('distinguishes waiting reviews from missing participant evidence and leaves holds untouched', () => {
    const snapshot = loanData(BOB, 'NEEDS_REVIEW'), item = snapshot.loans[0];
    snapshot.serverTime = item.pickup.start;
    item.pickupReceipt = { recipientId: BOB, reportedAt: now, note: '' }; item.issues.push({ id: fixtureId(906), authorId: BOB, createdAt: now, details: 'Reported issue' });
    const before = structuredClone(snapshot); expect(ownLoan(snapshot)[0].phase).toBe('waiting'); expect(snapshot).toEqual(before);
    expect(ownLoan({ ...snapshot, actor: data(ALICE).actor })[0].phase).toBe('now');
  });
  it('does not treat an optional complaint as required evidence in a trade review', () => {
    const state = trade(), loop = state.loops[0]; loop.state = 'NEEDS_REVIEW';
    const incoming = loop.transfers.find(t => t.receiverId === BOB)!;
    incoming.receipt = { recipientId: BOB, receivedAt: loop.start, note: '' };
    expect(activityTasks(bootstrapDto(state, BOB, loop.start)).find(t => t.kind === 'trade')?.phase).toBe('waiting');
    expect(activityTasks(bootstrapDto(state, ALICE, loop.start)).find(t => t.kind === 'trade')?.phase).toBe('now');
    expect(activityTasks(bootstrapDto(state, ALICE, loop.start - 601)).find(t => t.kind === 'trade')?.phase).toBe('waiting');
  });
  it('does not demand a loan complaint after receipts, or a return receipt before its clock opens', () => {
    const snapshot = loanData(ALICE, 'NEEDS_REVIEW'), item = snapshot.loans[0];
    expect(ownLoan(snapshot)[0].phase).toBe('waiting');
    snapshot.serverTime = item.pickup.start; expect(ownLoan(snapshot)[0].phase).toBe('now');
    item.pickupReceipt = { recipientId: BOB, reportedAt: snapshot.serverTime, note: '' };
    item.returnReceipt = { recipientId: ALICE, reportedAt: snapshot.serverTime, note: '' };
    expect(ownLoan(snapshot)[0].phase).toBe('waiting');
    expect(ownLoan({ ...snapshot, actor: data(BOB).actor })[0].phase).toBe('waiting');
  });
  it('offers paused or draft listing review only for editable items belonging to the actor', () => {
    const snapshot = data(); snapshot.listings[0].status = 'paused';
    expect(activityTasks(snapshot).find(t => t.kind === 'listing')?.title).toBe('Check the item before republishing');
    snapshot.listings[0].loanHeld = true; expect(activityTasks(snapshot).filter(t => t.kind === 'listing')).toEqual([]);
    snapshot.listings[0].loanHeld = false; snapshot.listings[0].status = 'reserved'; expect(activityTasks(snapshot).filter(t => t.kind === 'listing')).toEqual([]);
    snapshot.listings[0].status = 'draft'; snapshot.listings[0].ownerId = CAROL; expect(activityTasks(snapshot).filter(t => t.kind === 'listing')).toEqual([]);
  });
  it('warns for expired availability or inactive selected venues, without promising a shared match', () => {
    const snapshot = data(), actor = snapshot.actor;
    expect(meetupReadiness(actor, snapshot.venues, now).ready).toBe(true);
    actor.availability = [{ start: now, end: now + 8999 }]; expect(meetupReadiness(actor, snapshot.venues, now).hasAvailability).toBe(false);
    actor.availability[0].end++; expect(meetupReadiness(actor, snapshot.venues, now).hasAvailability).toBe(true);
    snapshot.venues.forEach(v => { v.active = false; }); expect(meetupReadiness(actor, snapshot.venues, now).ready).toBe(false);
    expect(activityTasks(snapshot).find(t => t.kind === 'account')?.href).toBe('/settings?tab=meetups');
  });
  it('keeps seven-day feedback inclusive and verifies the actor’s agreement edge', () => {
    const snapshot = loanData(BOB, 'RESOLVED'), id = snapshot.loans[0].id;
    snapshot.feedbackOpportunities = [{ kind: 'loan', referenceId: id, closesAt: now }];
    expect(activityTasks(snapshot).find(t => t.kind === 'feedback')?.href).toBe(`/loans/${id}#feedback`);
    expect(activityTasks({ ...snapshot, serverTime: now + 1 }).some(t => t.kind === 'feedback')).toBe(false);
    expect(activityTasks({ ...snapshot, actor: data(MODERATOR).actor }).some(t => t.kind === 'feedback')).toBe(false);
  });
  it('sorts actionable timed work before upcoming and waiting tasks without changing the snapshot', () => {
    const snapshot = data(); snapshot.loans.push(loan('REQUESTED'), { ...loan('RESERVED'), id: fixtureId(907) });
    snapshot.listings[0].status = 'draft'; const before = structuredClone(snapshot);
    expect(activityTasks(snapshot).map(t => t.phase)).toEqual(['now', 'now', 'upcoming']); expect(snapshot).toEqual(before);
  });
});
