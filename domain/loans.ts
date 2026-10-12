import { z } from 'zod';
import { fail, parse } from './errors';
import { appointmentsConflict, mergeWindows, validExactOption } from './matching';
import { ACTIVE_LOANS, ACTIVE_LOOPS, currentReturn, lendEnabled, loanHeld, type Loan, type MatchOption, type State } from './types';

const uuid = z.string().uuid();
const slot = z.object({ venueId: z.string().min(1).max(80), start: z.number().int(), end: z.number().int() }).strict();
const identity = { id: uuid, expectedSequence: z.number().int().nonnegative() };
const active = (loan: Loan) => ACTIVE_LOANS.includes(loan.state);
export { appointmentsConflict } from './matching';
export function visibleLoan(state: State, id: string, actorId: string): Loan {
  const actor = state.members.find(m => m.id === actorId && m.status === 'active');
  if (!actor) fail('FORBIDDEN', 'An active campus membership is required.', 403);
  const loan = state.loans?.find(l => l.id === id && (l.lenderId === actorId || l.borrowerId === actorId || actor.role === 'moderator'));
  if (!loan) fail('NOT_FOUND', 'This loan is unavailable.', 404);
  return loan;
}
function participant(state: State, id: string, actorId: string, sequence: number) {
  const loan = visibleLoan(state, id, actorId);
  if (![loan.lenderId, loan.borrowerId].includes(actorId)) fail('FORBIDDEN', 'Only a loan participant can take this action.', 403);
  if (loan.sequence !== sequence) fail('STALE_VERSION', 'This loan changed. Reload the latest agreement first.', 409);
  return loan;
}
export function emitLoan(state: State, loan: Loan, actorId: string, kind: string, message: string, now: number, operationId: string) {
  const event = { id: crypto.randomUUID(), loopId: null, loanId: loan.id, actorId, kind, at: now, message, operationId };
  state.events.push(event); loan.sequence++;
  for (const recipientId of new Set([loan.lenderId, loan.borrowerId, ...(loan.state === 'NEEDS_REVIEW' ? state.members.filter(m => m.role === 'moderator' && m.status === 'active').map(m => m.id) : [])])) {
    state.notifications.push({ id: `${event.id}:${recipientId}`, eventId: event.id, recipientId, loopId: null, loanId: loan.id, message, createdAt: now });
  }
}
export function affectLoans(state: State, predicate: (loan: Loan) => boolean, now: number, operationId: string, actorId: string, includeActive = false) {
  for (const loan of (state.loans ?? []).filter(predicate)) {
    if (loan.state === 'REQUESTED') { loan.state = 'STALE'; loan.reason = 'An item, membership, or meeting preference changed. Request fresh terms.'; }
    else if (includeActive && active(loan)) { loan.state = 'NEEDS_REVIEW'; loan.reason = 'A change requires moderator review. The item remains held.'; }
    else continue;
    emitLoan(state, loan, actorId, 'loan_changed', loan.reason, now, operationId);
  }
}
export function reconcileLoans(state: State, now: number, operationId: string) {
  for (const loan of state.loans ?? []) {
    if (loan.state === 'REQUESTED' && now >= loan.deadline) { loan.state = 'EXPIRED'; loan.reason = 'The lender response window passed.'; }
    else if (loan.state === 'RESERVED' && now >= loan.pickup.end + 7200) { loan.state = 'NEEDS_REVIEW'; loan.custody = 'unknown'; loan.reason = 'Pickup reporting is overdue. The item remains held.'; }
    else if (['ON_LOAN', 'RETURN_REPORTED'].includes(loan.state) && now >= currentReturn(loan).end + 7200) { loan.state = 'NEEDS_REVIEW'; loan.reason = 'Return reporting is overdue. The item remains held.'; }
    else continue;
    emitLoan(state, loan, 'system', 'loan_overdue', loan.reason, now, operationId);
  }
}
function validReturn(state: State, option: MatchOption, pickup: MatchOption, maxDays: number) {
  return option.start % 900 === 0 && option.end === option.start + 1800 && option.start >= pickup.start + 86400 && option.end <= pickup.end + maxDays * 86400 && state.venues.some(v => v.id === option.venueId && v.active && mergeWindows(v.windows).some(w => w.start <= option.start && w.end >= option.end));
}
function compatible(state: State, loan: Loan, now: number) {
  const item = state.listings.find(l => l.id === loan.listingId), ids = [loan.lenderId, loan.borrowerId];
  if (!item || item.ownerId !== loan.lenderId || item.version !== loan.item.version || !lendEnabled(item) || ids.some((id, i) => { const m = state.members.find(m => m.id === id); return !m || m.status !== 'active' || m.version !== loan.memberVersions[i] || m.preferenceVersion !== loan.preferenceVersions[i]; }) || state.blocks.some(b => ids.includes(b.blockerId) && ids.includes(b.blockedId)) || !validExactOption(state, ids, loan.pickup, now, 3600) || !validReturn(state, loan.returnSlot, loan.pickup, item.maxLoanDays ?? 7)) return 'STALE';
  if (item.status !== 'active' || loanHeld(state, item.id) || state.loops.some(l => ACTIVE_LOOPS.includes(l.state) && l.listingIds.includes(item.id)) || appointmentsConflict(state, ids, [loan.pickup, loan.returnSlot]) || (state.loans ?? []).filter(l => l.borrowerId === loan.borrowerId && active(l)).length >= 2) return 'CONFLICTED';
  return null;
}
export function applyLoanOperation(state: State, actorId: string, operation: string, input: unknown, now: number, operationId: string): unknown {
  if (operation === 'loan.request') {
    const body = parse(z.object({ listingId: uuid, expectedVersion: z.number().int().positive(), pickup: slot, returnSlot: slot, accepted: z.literal(true) }).strict(), input);
    const item = state.listings.find(l => l.id === body.listingId && l.status === 'active' && lendEnabled(l) && state.members.some(m => m.id === l.ownerId && m.status === 'active'));
    if (!item || item.ownerId === actorId || state.blocks.some(b => [actorId, item.ownerId].includes(b.blockerId) && [actorId, item.ownerId].includes(b.blockedId))) fail('NOT_FOUND', 'This item is unavailable for borrowing.', 404);
    if (item.version !== body.expectedVersion || loanHeld(state, item.id)) fail('CONFLICT', 'This item changed or is already held. Reload it first.', 409);
    if (!validExactOption(state, [item.ownerId, actorId], body.pickup, now, 7200)) fail('VALIDATION', 'Choose a shared 30-minute pickup at least two hours ahead.');
    if (!validReturn(state, body.returnSlot, body.pickup, item.maxLoanDays ?? 7)) fail('VALIDATION', 'Choose an approved 30-minute return appointment, at least one day after pickup and within the item’s maximum loan period.');
    state.loans ??= [];
    if (state.loans.some(l => l.listingId === item.id && l.borrowerId === actorId && ['REQUESTED', ...ACTIVE_LOANS].includes(l.state))) fail('CONFLICT', 'You already have a request or active loan for this item.', 409);
    if (state.loans.filter(l => l.borrowerId === actorId && l.createdAt > now - 86400).length >= 5 || state.loans.filter(l => l.borrowerId === actorId && l.state === 'REQUESTED').length >= 3) fail('RATE_LIMITED', 'You can send three pending requests and five per day.', 429);
    if (state.loans.some(l => l.borrowerId === actorId && l.lenderId === item.ownerId && l.state === 'DECLINED' && (state.events.filter(e => e.loanId === l.id).at(-1)?.at ?? 0) > now - 3600)) fail('RATE_LIMITED', 'Wait one hour before requesting again from a lender who declined.', 429);
    const members = [item.ownerId, actorId].map(id => state.members.find(m => m.id === id)!);
    const loan: Loan = { id: crypto.randomUUID(), listingId: item.id, lenderId: item.ownerId, borrowerId: actorId, item: structuredClone(item), pickup: body.pickup, returnSlot: body.returnSlot, deadline: Math.min(now + 86400, body.pickup.start - 3600), createdAt: now, memberVersions: [members[0].version, members[1].version], preferenceVersions: [members[0].preferenceVersion, members[1].preferenceVersion], state: 'REQUESTED', version: 1, sequence: 0, custody: 'owner', extensions: [], issues: [] };
    state.loans.push(loan); emitLoan(state, loan, actorId, 'loan_requested', 'A borrowing request is ready for the lender’s decision. Ownership stays with the lender.', now, operationId);
    return { loanId: loan.id, state: loan.state };
  }
  if (operation === 'moderation.loan.resolve') {
    if (state.members.find(m => m.id === actorId)?.role !== 'moderator') fail('FORBIDDEN', 'Moderator access is required.', 403);
    const body = parse(z.object({ ...identity, outcome: z.enum(['owner', 'lost', 'unresolved']), reason: z.string().trim().min(10).max(1000) }).strict(), input);
    const loan = visibleLoan(state, body.id, actorId);
    if (loan.sequence !== body.expectedSequence) fail('STALE_VERSION', 'Reload the latest loan evidence first.', 409);
    if (loan.state !== 'NEEDS_REVIEW') fail('CONFLICT', 'Only a loan needing review can be resolved.', 409);
    loan.resolution = body.reason;
    if (body.outcome !== 'unresolved') {
      loan.state = 'RESOLVED'; loan.custody = body.outcome; loan.closedAt = now;
      const item = state.listings.find(l => l.id === loan.listingId)!; item.status = body.outcome === 'lost' ? 'removed' : 'paused'; item.version++;
    }
    emitLoan(state, loan, actorId, 'loan_resolved', body.outcome === 'unresolved' ? 'The case remains open and the item stays held.' : 'A moderator recorded custody and closed the loan case. This does not create a participant receipt.', now, operationId);
    return { loanId: loan.id, state: loan.state };
  }
  const base = z.object(identity).strict();
  const body = operation === 'loan.vote' ? parse(z.object({ ...identity, vote: z.enum(['accept', 'decline']) }).strict(), input)
    : ['loan.pickup', 'loan.return'].includes(operation) ? parse(z.object({ ...identity, note: z.string().trim().max(500).default('') }).strict(), input)
    : operation === 'loan.problem' ? parse(z.object({ ...identity, details: z.string().trim().min(5).max(1000) }).strict(), input)
    : operation === 'loan.extend' ? parse(z.object({ ...identity, returnSlot: slot }).strict(), input)
    : operation === 'loan.extension.vote' ? parse(z.object({ ...identity, extensionId: uuid, vote: z.enum(['accept', 'decline']) }).strict(), input)
    : parse(base, input);
  const loan = participant(state, body.id, actorId, body.expectedSequence);
  if (operation === 'loan.vote' && 'vote' in body) {
    if (actorId !== loan.lenderId) fail('FORBIDDEN', 'Only the lender can decide this request.', 403);
    if (loan.state !== 'REQUESTED') fail('CONFLICT', 'This request is no longer awaiting a decision.', 409);
    const conflict = body.vote === 'accept' ? compatible(state, loan, now) : null;
    loan.state = body.vote === 'decline' ? 'DECLINED' : conflict ?? 'RESERVED';
    loan.reason = loan.state === 'RESERVED' ? undefined : loan.state === 'DECLINED' ? 'The lender declined.' : 'Terms or availability changed. No item was reserved.';
    emitLoan(state, loan, actorId, 'loan_decided', loan.reason ?? 'The lender accepted. This item is reserved through its return and closure.', now, operationId);
  } else if (operation === 'loan.cancel') {
    if (loan.state === 'REQUESTED' || (loan.state === 'RESERVED' && now < loan.pickup.start && !loan.pickupReceipt)) { loan.state = 'CANCELLED'; loan.reason = 'The loan was cancelled before pickup.'; }
    else if (active(loan)) { loan.state = 'NEEDS_REVIEW'; loan.reason = 'Cancellation after the pickup window needs review. The item remains held.'; }
    else fail('CONFLICT', 'This loan is already closed.', 409);
    emitLoan(state, loan, actorId, 'loan_cancelled', loan.reason, now, operationId);
  } else if (operation === 'loan.pickup' && 'note' in body && typeof body.note === 'string') {
    if (actorId !== loan.borrowerId) fail('FORBIDDEN', 'Only the borrower can acknowledge receiving the item.', 403);
    if (!active(loan) || loan.returnReceipt || loan.pickupReceipt) fail('CONFLICT', 'Pickup reporting is unavailable in this state.', 409);
    if (now < loan.pickup.start - 600) fail('VALIDATION', 'Pickup reporting opens ten minutes before the appointment.');
    loan.pickupReceipt = { recipientId: actorId, reportedAt: now, note: body.note }; loan.custody = 'borrower';
    if (loan.state === 'RESERVED') loan.state = 'ON_LOAN';
    emitLoan(state, loan, actorId, 'loan_pickup', 'The borrower acknowledged receiving the item. The lender still owns it.', now, operationId);
  } else if (operation === 'loan.return.report') {
    if (actorId !== loan.borrowerId) fail('FORBIDDEN', 'Only the borrower can report returning the item.', 403);
    if (!active(loan) || !loan.pickupReceipt || loan.returnReceipt || loan.returnReportedAt) fail('CONFLICT', 'A return report is unavailable in this state.', 409);
    loan.returnReportedAt = now;
    if (loan.state === 'ON_LOAN') loan.state = 'RETURN_REPORTED';
    emitLoan(state, loan, actorId, 'loan_return_reported', 'The borrower reported a return. The lender has not yet acknowledged receipt.', now, operationId);
  } else if (operation === 'loan.return' && 'note' in body && typeof body.note === 'string') {
    if (actorId !== loan.lenderId) fail('FORBIDDEN', 'Only the lender can acknowledge receiving their item back.', 403);
    if (!active(loan) || loan.returnReceipt || (!loan.pickupReceipt && loan.state !== 'NEEDS_REVIEW')) fail('CONFLICT', 'A recorded pickup is required for an ordinary return; missing pickup needs moderator review. Return reporting is unavailable in this state.', 409);
    if (now < loan.pickup.start - 600) fail('VALIDATION', 'Return reporting opens at the pickup window.');
    loan.returnReceipt = { recipientId: actorId, reportedAt: now, note: body.note }; loan.custody = 'owner';
    if (loan.state !== 'NEEDS_REVIEW') loan.state = 'RETURNED';
    emitLoan(state, loan, actorId, 'loan_return', 'The lender acknowledged receiving the item back. Inspect its condition before closing.', now, operationId);
  } else if (operation === 'loan.close') {
    if (actorId !== loan.lenderId) fail('FORBIDDEN', 'Only the lender can close a returned loan.', 403);
    if (loan.state !== 'RETURNED' || !loan.pickupReceipt || !loan.returnReceipt || loan.issues.length) fail('CONFLICT', 'Closing needs the lender’s return receipt and no unresolved issue.', 409);
    loan.state = 'CLOSED'; loan.closedAt = now;
    const item = state.listings.find(l => l.id === loan.listingId)!; item.status = 'paused'; item.version++;
    emitLoan(state, loan, actorId, 'loan_closed', 'The loan is closed. The listing is paused until its owner checks and republishes it.', now, operationId);
  } else if (operation === 'loan.problem' && 'details' in body && typeof body.details === 'string') {
    if (!active(loan)) fail('CONFLICT', 'Only an agreed, active loan can enter custody review.', 409);
    if (loan.issues.some(i => i.authorId === actorId)) fail('CONFLICT', 'Your report is already recorded. A moderator can review it.', 409);
    loan.issues.push({ id: crypto.randomUUID(), authorId: actorId, details: body.details, createdAt: now }); loan.state = 'NEEDS_REVIEW'; loan.reason = 'A participant reported a problem. The item remains held.';
    emitLoan(state, loan, actorId, 'loan_issue', loan.reason, now, operationId);
  } else if (operation === 'loan.extend' && 'returnSlot' in body && typeof body.returnSlot === 'object' && body.returnSlot !== null && 'start' in body.returnSlot) {
    if (actorId !== loan.borrowerId) fail('FORBIDDEN', 'Only the borrower can request an extension.', 403);
    if (loan.state !== 'ON_LOAN' || now >= currentReturn(loan).start || loan.extensions.some(e => e.status === 'pending') || loan.extensions.length >= 5) fail('CONFLICT', 'Request an extension before the current return window, with no other extension pending.', 409);
    const returnSlot = body.returnSlot as MatchOption;
    if (returnSlot.start <= currentReturn(loan).start || !validReturn(state, returnSlot, loan.pickup, loan.item.maxLoanDays ?? 7)) fail('VALIDATION', 'Choose a later approved return within the original maximum loan period.');
    loan.extensions.push({ id: crypto.randomUUID(), requestedAt: now, returnSlot, status: 'pending' });
    emitLoan(state, loan, actorId, 'loan_extension', 'An extension was requested. The current due appointment applies until the lender accepts.', now, operationId);
  } else if (operation === 'loan.extension.vote' && 'extensionId' in body && 'vote' in body) {
    if (actorId !== loan.lenderId) fail('FORBIDDEN', 'Only the lender can decide an extension.', 403);
    const extension = loan.extensions.find(e => e.id === body.extensionId && e.status === 'pending');
    if (!extension || loan.state !== 'ON_LOAN' || now >= currentReturn(loan).start) fail('CONFLICT', 'This extension is no longer awaiting a decision.', 409);
    if (body.vote === 'accept' && (!validReturn(state, extension.returnSlot, loan.pickup, loan.item.maxLoanDays ?? 7) || appointmentsConflict(state, [loan.lenderId, loan.borrowerId], [extension.returnSlot], loan.id))) fail('CONFLICT', 'The proposed return appointment is no longer available.', 409);
    extension.status = body.vote === 'accept' ? 'accepted' : 'declined'; extension.decidedAt = now;
    emitLoan(state, loan, actorId, 'loan_extension_decided', body.vote === 'accept' ? 'The lender accepted the new return appointment.' : 'The extension was declined. The current return appointment still applies.', now, operationId);
  } else fail('VALIDATION', 'This loan operation is not supported.');
  return { loanId: loan.id, state: loan.state };
}
