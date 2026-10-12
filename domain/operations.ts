import { z } from 'zod';
import { candidateFromCycle, validExactOption, matchedRule, mergeWindows } from './matching';
import { ACTIVE_LOOPS, loanHeld, tradeEnabled, type State, type Member, type Loop, type Event, type Want } from './types';

import { fail, parse } from './errors';
export { DomainError } from './errors';
import { affectLoans, appointmentsConflict, applyLoanOperation, reconcileLoans } from './loans';
import { applyReviewOperation } from './reputation';
const uuid = z.string().uuid();
const text = (max: number, min = 1) => z.string().trim().min(min).max(max);
export function requireMember(state: State, actorId: string): Member {
  const member = state.members.find(m => m.id === actorId);
  if (!member || member.status !== 'active') fail('FORBIDDEN', 'An active campus membership is required.', 403);
  return member!;
}
export function visibleLoop(state: State, id: string, actorId: string): Loop {
  const member = requireMember(state, actorId);
  const loop = state.loops.find(l => l.id === id && (l.participants.some(p => p.userId === actorId) || member.role === 'moderator'));
  if (!loop) fail('NOT_FOUND', 'This exchange is unavailable.', 404);
  return loop!;
}
function participantLoop(state: State, id: string, actorId: string): Loop {
  const loop = visibleLoop(state, id, actorId);
  if (!loop.participants.some(p => p.userId === actorId)) fail('FORBIDDEN', 'Only a participant can take this action.', 403);
  return loop;
}
function release(state: State, loop: Loop, exchanged = false) {
  for (const id of loop.listingIds) {
    const listing = state.listings.find(l => l.id === id)!;
    if (exchanged) listing.status = 'exchanged';
    else if (listing.status === 'reserved') listing.status = state.members.find(m => m.id === listing.ownerId)?.status === 'active' ? 'active' : 'paused';
  }
}
function emit(state: State, loop: Loop | null, actorId: string, kind: string, message: string, now: number, operationId: string, recipientIds?: string[]) {
  const event: Event = { id: crypto.randomUUID(), loopId: loop?.id ?? null, actorId, kind, at: now, message, operationId };
  state.events.push(event);
  if (loop) loop.sequence++;
  for (const recipientId of new Set(recipientIds ?? loop?.participants.map(p => p.userId) ?? [])) state.notifications.push({ id: `${event.id}:${recipientId}`, eventId: event.id, recipientId, loopId: loop?.id ?? null, message, createdAt: now });
}
export function reconcile(state: State, now: number, operationId: string) {
  for (const loop of state.loops) {
    if (loop.state === 'PENDING' && now >= loop.deadline) {
      loop.state = 'EXPIRED'; loop.terminalReason = 'The response deadline passed.';
      emit(state, loop, 'system', 'expired', 'An exchange proposal expired.', now, operationId);
    }
    if (loop.state === 'CONFIRMED' && now >= loop.end + 7200 && loop.transfers.some(t => !t.receipt)) {
      loop.state = 'NEEDS_REVIEW'; loop.terminalReason = 'Receipt reporting is overdue.';
      emit(state, loop, 'system', 'overdue', 'The exchange needs review. Please confirm what happened.', now, operationId);
    }
  }
  reconcileLoans(state, now, operationId);
  state.idempotency = state.idempotency.filter(k => k.at > now - 172800);
}
function invalidate(state: State, predicate: (loop: Loop) => boolean, now: number, operationId: string, actorId: string) {
  for (const loop of state.loops.filter(l => l.state === 'PENDING' && predicate(l))) {
    loop.state = 'STALE'; loop.terminalReason = 'An item or meeting preference changed.';
    emit(state, loop, actorId, 'stale', 'An exchange proposal needs fresh agreement because its terms changed.', now, operationId);
  }
}
function compatibleConfirmation(state: State, loop: Loop): 'STALE' | 'CONFLICTED' | null {
  for (const p of loop.participants) {
    const item = state.listings.find(l => l.id === p.offeredId), member = state.members.find(m => m.id === p.userId);
    if (!item || !member || item.version !== p.listingVersion || member.version !== p.memberVersion || member.preferenceVersion !== p.preferenceVersion || member.status !== 'active' || loop.policyVersion !== state.policyVersion) return 'STALE';
    if (!tradeEnabled(item) || loanHeld(state, item.id) || item.status !== 'active' || state.loops.some(l => ACTIVE_LOOPS.includes(l.state) && l.id !== loop.id && (l.listingIds.includes(item.id) || l.participants.some(q => q.userId === member.id)))) return 'CONFLICTED';
  }
  const ids = loop.participants.map(p => p.userId);
  if (state.blocks.some(b => ids.includes(b.blockerId) && ids.includes(b.blockedId))) return 'STALE';
  for (const transfer of loop.transfers) {
    const giver = state.listings.find(l => l.id === transfer.listingId)!;
    const recipient = state.listings.find(l => l.ownerId === transfer.receiverId && loop.listingIds.includes(l.id))!;
    const rule = matchedRule(giver, recipient);
    if (!rule || rule.id !== transfer.wantId || rule.version !== transfer.wantVersion || giver.ownerId !== transfer.giverId) return 'STALE';
  }
  if (appointmentsConflict(state, ids, [loop])) return 'CONFLICTED';
  if (!validExactOption(state, ids, { venueId: loop.venueId, start: loop.start, end: loop.end }, 0, 0)) return 'STALE';
  return null;
}
const wantSchema = z.object({ id: uuid.optional(), mode: z.enum(['category', 'catalog']), categoryId: text(80).optional(), catalogId: text(80).optional(), minCondition: z.number().int().min(1).max(3), priority: z.number().int().min(1).max(3) }).strict();
export function applyOperation(state: State, actorId: string, operation: string, input: unknown, now: number, operationId: string): unknown {
  const actor = requireMember(state, actorId);
  reconcile(state, now, operationId);
  if (operation.startsWith('loan.') || operation === 'moderation.loan.resolve') return applyLoanOperation(state, actorId, operation, input, now, operationId);
  if (operation.startsWith('review.') || operation === 'moderation.review.resolve') return applyReviewOperation(state, actorId, operation, input, now);
  if (operation === 'listing.save') {
    const body = parse(z.object({ id: uuid.optional(), expectedVersion: z.number().int().positive().optional(), title: text(80, 3), description: z.string().trim().max(1000), categoryId: text(80), catalogId: z.string().nullable(), condition: z.number().int().min(1).max(3), wants: z.array(wantSchema).max(5), offerMode: z.enum(['trade', 'lend', 'both']).optional(), maxLoanDays: z.number().int().min(1).max(14).optional(), loanTerms: z.string().trim().max(500).optional(), photo: z.string().max(160).nullable().optional(), photoAlt: z.string().trim().max(160).optional(), publish: z.boolean(), ownershipConfirmed: z.literal(true) }).strict(), input);
    if (!state.categories.some(c => c.id === body.categoryId) || (body.catalogId && !state.catalog.some(c => c.id === body.catalogId && c.categoryId === body.categoryId))) fail('VALIDATION', 'The catalog item must belong to the chosen category.');
    for (const w of body.wants) {
      if (w.mode === 'category' ? !w.categoryId || !!w.catalogId || !state.categories.some(c => c.id === w.categoryId) : !w.catalogId || !!w.categoryId || !state.catalog.some(c => c.id === w.catalogId)) fail('VALIDATION', 'Each want needs one valid category or catalog item.');
    }
    let listing = body.id ? state.listings.find(l => l.id === body.id) : undefined;
    if (body.id && !listing) fail('NOT_FOUND', 'This listing is unavailable.', 404);
    if (listing && listing.ownerId !== actorId) fail('FORBIDDEN', 'You can edit only your own items.', 403);
    const offerMode = body.offerMode ?? listing?.offerMode ?? 'trade';
    if (offerMode !== 'lend' && !body.wants.length) fail('VALIDATION', 'Trading requires at least one want rule.');
    if (listing && loanHeld(state, listing.id)) fail('CONFLICT', 'This item is held for a loan. Close its return or review first.', 409);
    if (listing && ['reserved', 'exchanged', 'removed'].includes(listing.status)) fail('CONFLICT', 'This item cannot be changed while reserved, exchanged, or removed.', 409);
    if (listing && body.expectedVersion !== listing.version) fail('STALE_VERSION', 'This item changed. Reload before saving.', 409);
    if (body.photo != null && body.photo !== listing?.photo && !/^\/api\/photos\/[0-9a-f-]{36}$/i.test(body.photo)) fail('VALIDATION', 'Upload your own item photo through the editor.');
    if (body.publish && (!actor.venueIds.some(id => state.venues.some(v => v.id === id && v.active)) || !actor.availability.some(w => w.end >= now + 9000))) fail('VALIDATION', 'Add an active approved venue and future availability before publishing.');
    if (body.publish && state.listings.filter(l => l.ownerId === actorId && ['active', 'reserved'].includes(l.status) && l.id !== listing?.id).length >= 3) fail('RATE_LIMITED', 'You can have at most three active items.', 429);
    if (body.publish && state.listings.filter(l => l.status === 'active' && l.id !== listing?.id).length >= 250) fail('RATE_LIMITED', 'This campus has reached its active-item limit.', 429);
    const wants: Want[] = body.wants.map(w => ({ ...w, id: w.id ?? crypto.randomUUID(), version: (listing?.wants.find(old => old.id === w.id)?.version ?? 0) + 1 }));
    if (new Set(wants.map(w => w.id)).size !== wants.length) fail('VALIDATION', 'Want rules must have distinct identities.');
    if (!listing) {
      listing = { id: crypto.randomUUID(), ownerId: actorId, title: body.title, description: body.description, categoryId: body.categoryId, catalogId: body.catalogId, condition: body.condition, wants, offerMode, maxLoanDays: body.maxLoanDays ?? 7, loanTerms: body.loanTerms ?? '', status: body.publish ? 'active' : 'draft', version: 1, photo: body.photo ?? null, photoAlt: body.photo ? body.photoAlt || body.title : '', createdAt: now };
      state.listings.push(listing);
    } else {
      Object.assign(listing, { title: body.title, description: body.description, categoryId: body.categoryId, catalogId: body.catalogId, condition: body.condition, wants, offerMode, maxLoanDays: body.maxLoanDays ?? listing?.maxLoanDays ?? 7, loanTerms: body.loanTerms ?? listing?.loanTerms ?? '', status: body.publish ? 'active' : 'draft', version: listing.version + 1 });
      if (body.photo !== undefined) listing.photo = body.photo;
      if (body.photoAlt !== undefined) listing.photoAlt = body.photoAlt || (listing.photo ? body.title : '');
      invalidate(state, l => l.listingIds.includes(listing!.id), now, operationId, actorId);
      affectLoans(state, l => l.listingId === listing!.id, now, operationId, actorId);
    }
    emit(state, null, actorId, 'listing_saved', body.publish ? 'Your item is available for proposals.' : 'Your item draft was saved.', now, operationId, [actorId]);
    return { listingId: listing.id, version: listing.version };
  }
  if (['listing.pause', 'listing.remove'].includes(operation)) {
    const body = parse(z.object({ id: uuid, expectedVersion: z.number().int().positive() }).strict(), input);
    const listing = state.listings.find(l => l.id === body.id && l.ownerId === actorId);
    if (!listing) fail('NOT_FOUND', 'This item is unavailable.', 404);
    if (listing!.version !== body.expectedVersion) fail('STALE_VERSION', 'Reload the changed item first.', 409);
    if (loanHeld(state, listing!.id)) fail('CONFLICT', 'Close this item’s loan before pausing or removing it.', 409);
    if (['reserved', 'exchanged', 'removed'].includes(listing!.status)) fail('CONFLICT', 'This item cannot be paused or removed in its current state.', 409);
    listing!.status = operation === 'listing.pause' ? 'paused' : 'removed'; listing!.version++;
    invalidate(state, l => l.listingIds.includes(body.id), now, operationId, actorId);
    affectLoans(state, l => l.listingId === body.id, now, operationId, actorId);
    return { listingId: body.id };
  }
  if (operation === 'profile.save') {
    const body = parse(z.object({ name: text(60, 2), timezone: text(80) }).strict(), input);
    try { new Intl.DateTimeFormat('en-US', { timeZone: body.timezone }).format(); } catch { fail('VALIDATION', 'Choose a valid IANA timezone.'); }
    actor.name = body.name; actor.timezone = body.timezone;
    return { saved: true };
  }
  if (operation === 'preferences.save') {
    const body = parse(z.object({ expectedVersion: z.number().int().positive(), venueIds: z.array(text(80)).min(1).max(10), availability: z.array(z.object({ start: z.number().int(), end: z.number().int() }).strict()).min(1).max(28) }).strict(), input);
    if (body.expectedVersion !== actor.preferenceVersion) fail('STALE_VERSION', 'Your availability changed. Reload before saving.', 409);
    if (new Set(body.venueIds).size !== body.venueIds.length || body.venueIds.some(id => !state.venues.some(v => v.id === id && v.active))) fail('VALIDATION', 'Choose approved campus venues.');
    if (body.availability.some(w => w.start % 900 !== 0 || w.end % 900 !== 0 || w.end - w.start < 1800 || w.start < now || w.end > now + 7 * 86400)) fail('VALIDATION', 'Use 15-minute boundaries and windows of at least 30 minutes within the next seven days.');
    actor.venueIds = body.venueIds; actor.availability = mergeWindows(body.availability); actor.preferenceVersion++;
    invalidate(state, l => l.participants.some(p => p.userId === actorId), now, operationId, actorId);
    affectLoans(state, l => [l.lenderId, l.borrowerId].includes(actorId), now, operationId, actorId);
    return { version: actor.preferenceVersion };
  }
  if (operation === 'loop.propose') {
    const body = parse(z.object({ listingIds: z.array(uuid).min(2).max(3), snapshots: z.array(z.object({ userId: uuid, listingVersion: z.number().int(), memberVersion: z.number().int(), preferenceVersion: z.number().int() }).strict()).min(2).max(3), option: z.object({ venueId: text(80), start: z.number().int(), end: z.number().int() }).strict(), accepted: z.literal(true) }).strict(), input);
    const { candidate } = candidateFromCycle(state, body.listingIds, actorId, now);
    if (!candidate) fail('CONFLICT', 'These items no longer form an available exchange. Find swaps again.', 409);
    if (body.snapshots.length !== candidate!.participants.length || new Set(body.snapshots.map(p => p.userId)).size !== body.snapshots.length || candidate!.participants.some(p => !body.snapshots.some(s => s.userId === p.userId && s.listingVersion === p.listingVersion && s.memberVersion === p.memberVersion && s.preferenceVersion === p.preferenceVersion))) fail('STALE_VERSION', 'An item or meeting preference changed. Find swaps again.', 409);
    if (!validExactOption(state, candidate!.participants.map(p => p.userId), body.option, now, 7200)) fail('VALIDATION', 'Choose a shared 30-minute meetup with at least two hours of lead time.');
    if (appointmentsConflict(state, candidate!.participants.map(p => p.userId), [body.option])) fail('CONFLICT', 'A participant has another agreed appointment at this time.', 409);
    const duplicate = state.loops.find(l => ['PENDING', 'CONFIRMED', 'NEEDS_REVIEW'].includes(l.state) && l.key === candidate!.key);
    if (duplicate) fail('CONFLICT', 'This exchange already has an active proposal. Open My loops.', 409);
    if (state.loops.filter(l => l.initiatorId === actorId && l.createdAt > now - 86400).length >= 5 || state.loops.filter(l => l.initiatorId === actorId && l.state === 'PENDING').length >= 3) fail('RATE_LIMITED', 'You can initiate three pending proposals and five per day.', 429);
    if (state.loops.some(l => l.initiatorId === actorId && l.state === 'DECLINED' && l.participants.some(p => p.vote === 'declined' && (p.voteAt ?? 0) > now - 3600 && candidate!.participants.some(q => q.userId === p.userId)))) fail('RATE_LIMITED', 'Please wait one hour before inviting a member who declined.', 429);
    const loop: Loop = { id: crypto.randomUUID(), initiatorId: actorId, key: candidate!.key, listingIds: candidate!.listingIds, transfers: candidate!.transfers.map(t => ({ ...t, id: crypto.randomUUID() })), participants: candidate!.participants.map(p => p.userId === actorId ? { ...p, vote: 'accepted', voteAt: now } : p), venueId: body.option.venueId, start: body.option.start, end: body.option.end, deadline: Math.min(now + 86400, body.option.start - 3600), state: 'PENDING', version: 1, sequence: 0, policyVersion: state.policyVersion, createdAt: now };
    if (loop.deadline <= now) fail('EXPIRED', 'This proposal has no remaining response window.', 409);
    state.loops.push(loop);
    emit(state, loop, actorId, 'proposed', `${actor.name.split(' ')[0]} proposed an exchange. Review your give and receive plan.`, now, operationId);
    return { loopId: loop.id, state: loop.state };
  }
  if (operation === 'loop.vote') {
    const body = parse(z.object({ id: uuid, expectedVersion: z.number().int().positive(), vote: z.enum(['accept', 'decline']) }).strict(), input);
    const loop = participantLoop(state, body.id, actorId);
    if (body.expectedVersion !== loop.version) fail('STALE_VERSION', 'Reload the proposal before deciding.', 409);
    if (loop.state !== 'PENDING') return { loopId: loop.id, state: loop.state, reason: loop.terminalReason };
    const participant = loop.participants.find(p => p.userId === actorId)!;
    if (participant.vote === 'accepted' && body.vote === 'accept') return { loopId: loop.id, state: loop.state };
    participant.vote = body.vote === 'accept' ? 'accepted' : 'declined'; participant.voteAt = now;
    if (body.vote === 'decline') { loop.state = 'DECLINED'; loop.terminalReason = 'A participant declined.'; }
    else if (loop.participants.every(p => p.vote === 'accepted')) {
      const conflict = compatibleConfirmation(state, loop);
      if (conflict) { loop.state = conflict; loop.terminalReason = conflict === 'CONFLICTED' ? 'An item or participant became unavailable. Nothing was reserved for this proposal.' : 'A material term changed. A fresh proposal is needed.'; }
      else { loop.state = 'CONFIRMED'; for (const id of loop.listingIds) state.listings.find(l => l.id === id)!.status = 'reserved'; }
    }
    emit(state, loop, actorId, 'vote', loop.state === 'CONFIRMED' ? 'Everyone accepted. All items are reserved for this meetup.' : loop.state === 'PENDING' ? `${actor.name.split(' ')[0]} accepted the exchange.` : loop.terminalReason!, now, operationId);
    return { loopId: loop.id, state: loop.state, reason: loop.terminalReason };
  }
  if (operation === 'loop.cancel') {
    const body = parse(z.object({ id: uuid, expectedVersion: z.number().int().positive() }).strict(), input);
    const loop = participantLoop(state, body.id, actorId);
    if (body.expectedVersion !== loop.version) fail('STALE_VERSION', 'Reload the exchange first.', 409);
    if (loop.state === 'PENDING') loop.state = 'CANCELLED';
    else if (loop.state === 'CONFIRMED' && now < loop.start && !loop.transfers.some(t => t.receipt) && !state.problems.some(p => p.loopId === loop.id)) { loop.state = 'CANCELLED'; release(state, loop); }
    else if (ACTIVE_LOOPS.includes(loop.state)) loop.state = 'NEEDS_REVIEW';
    else return { loopId: loop.id, state: loop.state };
    loop.terminalReason = loop.state === 'NEEDS_REVIEW' ? 'A participant requested review. Item holds remain in place.' : 'A participant cancelled before the meetup.';
    emit(state, loop, actorId, 'cancel', loop.terminalReason, now, operationId);
    return { loopId: loop.id, state: loop.state };
  }
  if (operation === 'loop.receipt') {
    const body = parse(z.object({ id: uuid, transferId: uuid, note: z.string().trim().max(500).default('') }).strict(), input);
    const loop = participantLoop(state, body.id, actorId);
    const transfer = loop.transfers.find(t => t.id === body.transferId);
    if (!transfer || transfer.receiverId !== actorId) fail('FORBIDDEN', 'Only the intended recipient can record this receipt.', 403);
    if (transfer!.receipt) return { loopId: loop.id, state: loop.state, received: true };
    if (!ACTIVE_LOOPS.includes(loop.state)) fail('CONFLICT', 'Receipt reporting is unavailable in this exchange state.', 409);
    if (now < loop.start - 600) fail('VALIDATION', 'Receipt reporting opens ten minutes before the meetup.');
    transfer!.receipt = { recipientId: actorId, receivedAt: now, note: body.note ?? '' };
    if (loop.state === 'CONFIRMED' && loop.transfers.every(t => t.receipt) && !state.problems.some(p => p.loopId === loop.id && p.status === 'open')) { loop.state = 'COMPLETED'; release(state, loop, true); }
    emit(state, loop, actorId, 'receipt', loop.state === 'COMPLETED' ? 'All recipients reported receipt. The exchange is complete.' : `${actor.name.split(' ')[0]} reported receiving their item.`, now, operationId);
    return { loopId: loop.id, state: loop.state, received: true };
  }
  if (operation === 'loop.problem' || operation === 'report.listing') {
    const body = parse(z.object({ id: uuid, kind: z.enum(['condition', 'missing_item', 'no_show', 'inappropriate', 'other']), details: text(1000, 5) }).strict(), input);
    const loop = operation === 'loop.problem' ? participantLoop(state, body.id, actorId) : null;
    if (loop && !ACTIVE_LOOPS.includes(loop.state)) fail('CONFLICT', 'You can report a handoff problem only for a confirmed or reviewed exchange.', 409);
    if (!loop && !state.listings.some(l => l.id === body.id && (l.ownerId === actorId || (['active','reserved'].includes(l.status) && state.members.some(m => m.id === l.ownerId && m.status === 'active'))))) fail('NOT_FOUND', 'This item is unavailable.', 404);
    if (state.problems.some(p => p.actorId === actorId && p.status === 'open' && (loop ? p.loopId === loop.id : p.listingId === body.id))) fail('CONFLICT', 'You already have an open report for this exchange or listing. A moderator can review it.', 409);
    state.problems.push({ id: crypto.randomUUID(), actorId, loopId: loop?.id ?? null, listingId: loop ? null : body.id, kind: body.kind, details: body.details, status: 'open', createdAt: now });
    if (loop) { loop.state = 'NEEDS_REVIEW'; loop.terminalReason = 'A participant reported a problem. All item holds remain.'; }
    emit(state, loop, actorId, 'problem', loop ? 'A problem was reported. The exchange needs review; all holds remain.' : 'Your listing report was sent to campus moderation.', now, operationId, loop ? undefined : [actorId, ...state.members.filter(m => m.role === 'moderator').map(m => m.id)]);
    return { reported: true, state: loop?.state };
  }
  if (operation === 'member.block') {
    const body = parse(z.object({ id: uuid, blocked: z.boolean() }).strict(), input);
    if (body.id === actorId || !state.members.some(m => m.id === body.id)) fail('VALIDATION', 'Choose another campus member.');
    state.blocks = state.blocks.filter(b => !(b.blockerId === actorId && b.blockedId === body.id));
    if (body.blocked) {
      state.blocks.push({ blockerId: actorId, blockedId: body.id });
      const affected = (l: Loop) => l.participants.some(p => p.userId === actorId) && l.participants.some(p => p.userId === body.id);
      invalidate(state, affected, now, operationId, actorId);
      affectLoans(state, l => [l.lenderId, l.borrowerId].includes(actorId) && [l.lenderId, l.borrowerId].includes(body.id), now, operationId, actorId, true);
      for (const loop of state.loops.filter(l => ACTIVE_LOOPS.includes(l.state) && affected(l))) { loop.state = 'NEEDS_REVIEW'; emit(state, loop, actorId, 'review', 'This exchange needs moderator review.', now, operationId); }
    }
    return { blocked: body.blocked };
  }
  if (operation === 'notification.read') {
    const body = parse(z.object({ ids: z.array(text(100)).max(100) }).strict(), input);
    for (const n of state.notifications.filter(n => n.recipientId === actorId && body.ids.includes(n.id))) n.readAt ??= now;
    return { read: true };
  }
  if (operation === 'member.delete' || operation === 'moderation.suspend') {
    if (operation.startsWith('moderation.') && actor.role !== 'moderator') fail('FORBIDDEN', 'Moderator access is required.', 403);
    const body = operation === 'member.delete' ? { id: actorId, reason: 'Member requested account deletion.' } : parse(z.object({ id: uuid, reason: text(500, 5) }).strict(), input);
    const member = state.members.find(m => m.id === body.id);
    if (!member || member.role === 'moderator') fail('VALIDATION', 'This membership cannot be changed through this action.');
    affectLoans(state, l => [l.lenderId, l.borrowerId].includes(body.id), now, operationId, actorId, true);
    member.status = operation === 'member.delete' ? 'left' : 'suspended'; member.version++;
    for (const l of state.listings.filter(l => l.ownerId === body.id && !loanHeld(state, l.id) && !['reserved', 'exchanged', 'removed'].includes(l.status))) { l.status = 'paused'; l.version++; }
    invalidate(state, l => l.participants.some(p => p.userId === body.id), now, operationId, actorId);
    for (const l of state.loops.filter(l => ACTIVE_LOOPS.includes(l.state) && l.participants.some(p => p.userId === body.id))) { l.state = 'NEEDS_REVIEW'; emit(state, l, actorId, 'membership_review', 'A membership change requires review of this exchange.', now, operationId); }
    emit(state, null, actorId, operation, body.reason, now, operationId, [actorId]);
    return { saved: true };
  }
  if (operation === 'moderation.listing') {
    if (actor.role !== 'moderator') fail('FORBIDDEN', 'Moderator access is required.', 403);
    const body = parse(z.object({ id: uuid, reason: text(500, 5) }).strict(), input);
    const listing = state.listings.find(l => l.id === body.id);
    if (!listing) fail('NOT_FOUND', 'Item not found.', 404);
    if (loanHeld(state, listing!.id)) {
      affectLoans(state, l => l.listingId === body.id, now, operationId, actorId, true);
    } else if (listing!.status === 'reserved') {
      for (const l of state.loops.filter(l => ACTIVE_LOOPS.includes(l.state) && l.listingIds.includes(body.id))) { l.state = 'NEEDS_REVIEW'; emit(state, l, actorId, 'moderation_review', 'A listing report requires review. Item holds remain.', now, operationId); }
    } else if (listing!.status !== 'exchanged') { listing!.status = 'removed'; listing!.version++; invalidate(state, l => l.listingIds.includes(body.id), now, operationId, actorId); }
    for (const report of state.problems.filter(p => p.listingId === body.id && p.status === 'open')) { report.status = 'closed'; report.resolution = body.reason; }
    emit(state, null, actorId, 'moderation_listing', body.reason, now, operationId, [listing!.ownerId]);
    return { saved: true };
  }
  if (operation === 'moderation.venue') {
    if (actor.role !== 'moderator') fail('FORBIDDEN', 'Moderator access is required.', 403);
    const body = parse(z.object({ id: text(80), windows: z.array(z.object({ start: z.number().int(), end: z.number().int() }).strict()).max(28) }).strict(), input);
    const venue = state.venues.find(v => v.id === body.id && v.active);
    if (!venue || body.windows.some(w => w.start < now || w.end > now + 30 * 86400 || w.start % 900 !== 0 || w.end % 900 !== 0 || w.end - w.start < 1800)) fail('VALIDATION', 'Publish approved venue hours on 15-minute boundaries within the next 30 days.');
    venue.windows = mergeWindows(body.windows);
    invalidate(state, l => l.venueId === body.id, now, operationId, actorId);
    for (const loop of state.loops.filter(l => ACTIVE_LOOPS.includes(l.state) && l.venueId === body.id && !venue.windows.some(w => w.start <= l.start && w.end >= l.end))) { loop.state = 'NEEDS_REVIEW'; emit(state, loop, actorId, 'venue_review', 'The approved venue calendar changed. This exchange needs review.', now, operationId); }
    affectLoans(state, l => l.pickup.venueId === body.id || l.returnSlot.venueId === body.id || l.extensions.some(e => e.status === 'accepted' && e.returnSlot.venueId === body.id), now, operationId, actorId);
    affectLoans(state, l => (l.returnReceipt ? [] : l.pickupReceipt ? [l.extensions.filter(e => e.status === 'accepted').at(-1)?.returnSlot ?? l.returnSlot] : [l.pickup, l.extensions.filter(e => e.status === 'accepted').at(-1)?.returnSlot ?? l.returnSlot]).some(s => s.end > now && s.venueId === body.id && !venue.windows.some(w => w.start <= s.start && w.end >= s.end)), now, operationId, actorId, true);
    emit(state, null, actorId, 'venue_calendar', 'Approved venue hours were updated. Members can choose their own availability.', now, operationId, [actorId]);
    return { saved: true };
  }
  if (operation === 'moderation.resolve') {
    if (actor.role !== 'moderator') fail('FORBIDDEN', 'Moderator access is required.', 403);
    const body = parse(z.object({ id: uuid, expectedVersion: z.number().int().positive(), expectedSequence: z.number().int().nonnegative(), reason: text(1000, 10), outcomes: z.array(z.object({ listingId: uuid, outcome: z.enum(['recipient', 'original_owner', 'unresolved']) }).strict()).min(2).max(3) }).strict(), input);
    const loop = visibleLoop(state, body.id, actorId);
    if (loop.version !== body.expectedVersion || loop.state !== 'NEEDS_REVIEW') fail('CONFLICT', 'Reload a reviewed exchange before resolving it.', 409);
    if (loop.sequence !== body.expectedSequence) fail('STALE_VERSION', 'This review changed. Reload its latest receipts and outcomes before resolving it.', 409);
    if (body.outcomes.length !== loop.transfers.length || new Set(body.outcomes.map(o => o.listingId)).size !== loop.transfers.length || body.outcomes.some(o => !loop.listingIds.includes(o.listingId))) fail('VALIDATION', 'Record one outcome for every item.');
    for (const t of loop.transfers) t.outcome = body.outcomes.find(o => o.listingId === t.listingId)!.outcome;
    loop.resolution = body.reason;
    if (!body.outcomes.some(o => o.outcome === 'unresolved')) {
      loop.state = loop.transfers.every(t => t.receipt && t.outcome === 'recipient') ? 'COMPLETED' : 'RESOLVED';
      for (const t of loop.transfers) state.listings.find(l => l.id === t.listingId)!.status = t.outcome === 'recipient' ? 'exchanged' : 'paused';
      for (const p of state.problems.filter(p => p.loopId === loop.id && p.status === 'open')) { p.status = 'closed'; p.resolution = 'See the exchange resolution and its immutable event history.'; }
    }
    emit(state, loop, actorId, 'resolved', loop.state === 'NEEDS_REVIEW' ? 'Review remains open because an item outcome is unresolved.' : 'A moderator recorded the item outcomes and closed this review.', now, operationId);
    return { loopId: loop.id, state: loop.state };
  }
  fail('VALIDATION', 'This operation is not supported.');
}
