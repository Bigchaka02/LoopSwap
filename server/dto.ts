import { loanHeld, type State } from '../domain/types';
import { feedbackOpportunities, publishedReview, reputationFor } from '../domain/reputation';
import { requireMember } from '../domain/operations';
export function bootstrapDto(state: State, actorId: string, now: number) {
  const actor = requireMember(state, actorId);
  const listings = state.listings.filter(l => (l.status === 'active' || l.status === 'reserved' || l.ownerId === actorId) && (state.members.find(m => m.id === l.ownerId)?.status === 'active' || l.ownerId === actorId));
  return {
    mode: state.mode, actor, serverTime: now,
    feedbackOpportunities: feedbackOpportunities(state, actorId, now),
    categories: state.categories, catalog: state.catalog,
    venues: state.venues.map(({ id, name, description, accessibility, active }) => ({ id, name, description, accessibility, active })),
    members: state.members.filter(m => m.status === 'active' || m.id === actorId).map(({ id, name, color }) => ({ id, name, color })),
    listings: listings.map(l => ({ ...l, loanHeld: loanHeld(state, l.id) })),
    loans: (state.loans ?? []).filter(l => [l.lenderId, l.borrowerId].includes(actorId) || actor.role === 'moderator'),
    reviews: (state.reviews ?? []).filter(r => r.reviewerId === actorId || actor.role === 'moderator' || (publishedReview(state, r, now) && (r.subjectId === actorId || r.status !== 'excluded'))).map(r => actor.role === 'moderator' || [r.reviewerId, r.subjectId].includes(actorId) ? { ...r, published: publishedReview(state, r, now) } : { ...r, published: true, dispute: undefined, decisions: [] }),
    reputations: Object.fromEntries(state.members.filter(m => m.status === 'active' || m.id === actorId).map(m => [m.id, reputationFor(state, m.id, now)])),
    venueWindows: actor.role === 'moderator' ? state.venues : [],
    loops: state.loops.filter(l => l.participants.some(p => p.userId === actorId) || actor.role === 'moderator'),
    notifications: state.notifications.filter(n => n.recipientId === actorId).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100),
    blockedIds: state.blocks.filter(b => b.blockerId === actorId).map(b => b.blockedId),
    problems: actor.role === 'moderator' ? state.problems : state.problems.filter(p => p.actorId === actorId),
    events: state.events.filter(e => (e.loopId && state.loops.some(l => l.id === e.loopId && (actor.role === 'moderator' || l.participants.some(p => p.userId === actorId)))) || (e.loanId && (state.loans ?? []).some(l => l.id === e.loanId && (actor.role === 'moderator' || [l.lenderId, l.borrowerId].includes(actorId))))).map(e => actor.role === 'moderator' ? e : { id: e.id, loopId: e.loopId, loanId: e.loanId, at: e.at, message: e.message }),
  };
}
