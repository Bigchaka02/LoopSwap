import { currentReturn, type FeedbackOpportunity, type Listing, type Loan, type Loop, type Member, type Venue } from './types';

export type ActivityPhase = 'now' | 'upcoming' | 'waiting';
export type ActivityKind = 'trade' | 'loan' | 'listing' | 'account' | 'feedback';
export type ActivityTask = {
  id: string; kind: ActivityKind; phase: ActivityPhase; title: string; detail: string;
  href: string; cta: string; itemTitle?: string; at?: number; timeLabel?: string; overdue?: boolean;
};
export type ActivitySnapshot = {
  actor: Member | null; serverTime: number; listings: Listing[]; loops: Loop[]; loans: Loan[];
  venues: Pick<Venue, 'id' | 'active'>[]; feedbackOpportunities: FeedbackOpportunity[];
};

export function meetupReadiness(actor: Member, venues: ActivitySnapshot['venues'], now: number) {
  const hasVenue = actor.venueIds.some(id => venues.some(v => v.id === id && v.active));
  const hasAvailability = actor.availability.some(w => w.end >= now + 9000);
  return { hasVenue, hasAvailability, ready: hasVenue && hasAvailability };
}

/** Suggestions from recorded state. Every write still happens in the original agreement form. */
export function activityTasks(data: ActivitySnapshot): ActivityTask[] {
  const { actor, serverTime: now } = data;
  if (!actor || actor.status !== 'active') return [];
  const tasks: ActivityTask[] = [];
  for (const loop of data.loops) {
    const participant = loop.participants.find(p => p.userId === actor.id);
    if (!participant) continue;
    const incoming = loop.transfers.find(t => t.receiverId === actor.id);
    const base = { id: `trade:${loop.id}`, kind: 'trade' as const, href: `/loops/${loop.id}`, itemTitle: incoming?.item.title };
    if (loop.state === 'PENDING' && now < loop.deadline) {
      tasks.push({ ...base, phase: participant.vote === 'pending' ? 'now' : 'waiting', title: participant.vote === 'pending' ? 'Review a trade proposal' : 'Wait for the other approvals', detail: participant.vote === 'pending' ? 'Read the exact items and meetup before accepting or declining.' : 'You accepted. Items are reserved only after everyone agrees.', cta: 'View trade proposal', at: loop.deadline, timeLabel: 'Response deadline' });
    } else if (loop.state === 'NEEDS_REVIEW') {
      const canContribute = incoming && !incoming.receipt && now >= loop.start - 600;
      tasks.push({ ...base, phase: canContribute ? 'now' : 'waiting', title: canContribute ? 'Review the trade handoff' : 'Wait for the trade review', detail: 'Check the recorded evidence and report what happened. Unresolved items remain held.', cta: 'Open trade evidence' });
    } else if (loop.state === 'CONFIRMED') {
      const opens = loop.start - 600;
      if (now < opens) tasks.push({ ...base, phase: 'upcoming', title: 'Prepare for your trade meetup', detail: 'Bring your agreed item. Inspect what you receive at the public venue.', cta: 'View meetup plan', at: loop.start, timeLabel: 'Meetup' });
      else if (incoming && !incoming.receipt) tasks.push({ ...base, phase: 'now', title: 'Record your own receipt', detail: 'Acknowledge only after personally receiving and inspecting the item. Report a problem if the handoff did not happen.', cta: 'Review handoff', at: loop.end, timeLabel: 'Meetup ends', overdue: now > loop.end });
      else tasks.push({ ...base, phase: now < loop.end ? 'upcoming' : 'waiting', title: now < loop.end ? 'Complete your agreed handoff' : 'Wait for the remaining receipts', detail: 'Your incoming receipt is recorded. Each other recipient must acknowledge their own item.', cta: 'View handoff progress', at: loop.end, timeLabel: 'Meetup ends' });
    }
  }
  for (const loan of data.loans) {
    const lender = loan.lenderId === actor.id, borrower = loan.borrowerId === actor.id;
    if (!lender && !borrower) continue;
    const due = currentReturn(loan);
    const base = { id: `loan:${loan.id}`, kind: 'loan' as const, href: `/loans/${loan.id}`, itemTitle: loan.item.title };
    if (loan.state === 'REQUESTED' && now < loan.deadline) {
      tasks.push({ ...base, phase: lender ? 'now' : 'waiting', title: lender ? 'Review a borrowing request' : 'Wait for the lender’s response', detail: lender ? 'Check the item, pickup, return appointment, and terms before deciding.' : 'Your request has no reservation until the lender accepts. You can withdraw it in the agreement.', cta: 'View borrowing request', at: loan.deadline, timeLabel: 'Response deadline' });
    } else if (loan.state === 'NEEDS_REVIEW') {
      const canContribute = now >= loan.pickup.start - 600 && ((borrower && !loan.pickupReceipt && !loan.returnReceipt) || (lender && !loan.returnReceipt));
      tasks.push({ ...base, phase: canContribute ? 'now' : 'waiting', title: canContribute ? 'Review the loan’s custody' : 'Wait for the loan review', detail: 'Read the reports and acknowledge only what you personally received. The item stays held until custody is resolved.', cta: 'Open loan evidence' });
    } else if (loan.state === 'RESERVED') {
      const opens = loan.pickup.start - 600;
      tasks.push({ ...base, phase: now < opens ? 'upcoming' : borrower ? 'now' : 'waiting', title: now < opens ? 'Prepare for loan pickup' : borrower ? 'Acknowledge pickup if received' : 'Wait for the borrower’s pickup receipt', detail: borrower ? 'Inspect the item at pickup. Record receipt only after you actually have it.' : 'Bring the agreed item. The borrower records their own physical receipt.', cta: 'View pickup plan', at: loan.pickup.start, timeLabel: 'Pickup', overdue: now > loan.pickup.end });
    } else if (['ON_LOAN', 'RETURN_REPORTED'].includes(loan.state)) {
      if (loan.state === 'ON_LOAN' && now < due.start && loan.extensions.some(e => e.status === 'pending')) {
        tasks.push({ ...base, id: `extension:${loan.id}`, phase: lender ? 'now' : 'waiting', title: lender ? 'Decide a return extension' : 'Wait for the extension decision', detail: 'The current return appointment still applies until the lender accepts the new one.', cta: 'Review extension', at: due.start, timeLabel: 'Decide before current return' });
      }
      const reported = !!loan.returnReportedAt;
      const waiting = borrower && reported;
      tasks.push({ ...base, phase: waiting ? 'waiting' : reported || now >= due.start ? 'now' : 'upcoming', title: waiting ? 'Wait for the lender’s return receipt' : lender ? 'Receive the item back' : 'Return the borrowed item', detail: waiting ? 'Your return report is recorded. The lender still needs to acknowledge receiving the item.' : lender ? 'Acknowledge return only once the item is physically back with you. Then inspect its condition.' : 'Follow the agreed return appointment. Report return after handing the item back; the lender confirms their own receipt.', cta: 'View return plan', at: due.start, timeLabel: 'Agreed return', overdue: !waiting && !loan.returnReceipt && now > due.end });
    } else if (loan.state === 'RETURNED') {
      const canClose = lender && !!loan.pickupReceipt && !!loan.returnReceipt && loan.issues.length === 0;
      tasks.push({ ...base, phase: canClose ? 'now' : 'waiting', title: canClose ? 'Inspect the item and close the loan' : 'Wait for the loan to close', detail: canClose ? 'Check its condition and all parts. Closing pauses the listing until you review and republish it.' : 'The lender’s return receipt is recorded. Closure requires their condition check.', cta: 'View loan inspection' });
    }
  }
  for (const opportunity of data.feedbackOpportunities) {
    if (now > opportunity.closesAt) continue;
    const loan = opportunity.kind === 'loan' ? data.loans.find(l => l.id === opportunity.referenceId && [l.lenderId, l.borrowerId].includes(actor.id) && ['CLOSED', 'RESOLVED'].includes(l.state)) : undefined;
    const loop = opportunity.kind === 'trade' ? data.loops.find(l => l.id === opportunity.referenceId && l.transfers.some(t => t.receiverId === actor.id) && ['COMPLETED', 'RESOLVED'].includes(l.state)) : undefined;
    if (!loan && !loop) continue;
    tasks.push({ id: `feedback:${opportunity.kind}:${opportunity.referenceId}`, kind: 'feedback', phase: 'now', title: `Share your ${opportunity.kind === 'loan' ? 'loan' : 'trade'} experience`, itemTitle: loan?.item.title ?? loop?.transfers.find(t => t.receiverId === actor.id)?.item.title, detail: 'Assess only what you observed against the original description and promises. Unobserved facts can stay unscored.', cta: 'Write participant feedback', href: `/${loan ? 'loans' : 'loops'}/${opportunity.referenceId}#feedback`, at: opportunity.closesAt, timeLabel: 'Feedback closes' });
  }
  const ready = meetupReadiness(actor, data.venues, now);
  if (!ready.ready) tasks.push({ id: 'account:meetups', kind: 'account', phase: 'now', title: !ready.hasVenue ? 'Choose an active public venue' : 'Refresh your meetup availability', detail: 'New offers need an active approved venue and future availability. Saving preferences requires fresh agreement on pending proposals.', href: '/settings?tab=meetups', cta: 'Review meetup preferences' });
  for (const listing of data.listings) {
    if (listing.ownerId !== actor.id || listing.loanHeld || !['draft', 'paused'].includes(listing.status)) continue;
    tasks.push({ id: `listing:${listing.id}`, kind: 'listing', phase: 'now', title: listing.status === 'draft' ? 'Finish your item draft' : 'Check the item before republishing', itemTitle: listing.title, detail: listing.status === 'draft' ? 'Review its condition, offer mode, and terms. Publishing needs your ownership and accuracy confirmation.' : 'Confirm you have it and update its condition or missing parts. It stays paused until you explicitly publish.', href: `/listings/${listing.id}/edit`, cta: 'Review item listing' });
  }
  const rank: Record<ActivityPhase, number> = { now: 0, upcoming: 1, waiting: 2 };
  return tasks.sort((a, b) => rank[a.phase] - rank[b.phase] || Number(!!b.overdue) - Number(!!a.overdue) || (a.at ?? Infinity) - (b.at ?? Infinity) || a.id.localeCompare(b.id));
}
