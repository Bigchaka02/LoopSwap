import { ACTIVE_LOANS, ACTIVE_LOOPS, currentReturn, loanHeld, tradeEnabled, type Candidate, type Listing, type MatchOption, type State, type TimeWindow, type Want } from './types';

export function canonicalCycle(ids: string[]): string[] {
  return ids.map((_, i) => [...ids.slice(i), ...ids.slice(0, i)]).sort((a, b) => a.join('|').localeCompare(b.join('|')))[0] ?? [];
}
export function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
  const result: TimeWindow[] = [];
  for (const w of [...windows].filter(w => w.end > w.start).sort((a, b) => a.start - b.start || a.end - b.end)) {
    const last = result.at(-1);
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else result.push({ ...w });
  }
  return result;
}
export function intersectWindows(sets: TimeWindow[][]): TimeWindow[] {
  if (!sets.length) return [];
  return sets.slice(1).reduce((acc, set) => mergeWindows(acc.flatMap(a => mergeWindows(set).flatMap(b => {
    const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
    return end > start ? [{ start, end }] : [];
  }))), mergeWindows(sets[0]));
}
export function matchedRule(giver: Listing, recipient: Listing): Want | undefined {
  if (giver.ownerId === recipient.ownerId || ![1, 2, 3].includes(giver.condition)) return undefined;
  return recipient.wants.filter(w => giver.condition >= w.minCondition && (
    w.mode === 'catalog' ? !!giver.catalogId && giver.catalogId === w.catalogId : giver.categoryId === w.categoryId
  )).sort((a, b) => b.priority - a.priority || Number(b.mode === 'catalog') - Number(a.mode === 'catalog') || a.id.localeCompare(b.id))[0];
}
export function eligibleListings(state: State): Listing[] {
  const heldOwners = new Set(state.loops.filter(l => ACTIVE_LOOPS.includes(l.state)).flatMap(l => l.participants.map(p => p.userId)));
  const heldItems = new Set(state.loops.filter(l => ACTIVE_LOOPS.includes(l.state)).flatMap(l => l.listingIds));
  return state.listings.filter(l => tradeEnabled(l) && l.status === 'active' && !loanHeld(state, l.id) && !heldItems.has(l.id) && !heldOwners.has(l.ownerId) && state.members.some(m => m.id === l.ownerId && m.status === 'active')).sort((a, b) => a.id.localeCompare(b.id));
}
function overlap(a: MatchOption, b: MatchOption) { return a.start < b.end && b.start < a.end; }
export function appointmentsConflict(state: State, ids: string[], slots: MatchOption[], exceptLoan?: string) {
  return state.loops.some(l => ACTIVE_LOOPS.includes(l.state) && l.participants.some(p => ids.includes(p.userId)) && slots.some(s => overlap(s, l))) || (state.loans ?? []).some(l => ACTIVE_LOANS.includes(l.state) && l.id !== exceptLoan && [l.lenderId, l.borrowerId].some(id => ids.includes(id)) && slots.some(s => overlap(s, l.pickup) || overlap(s, currentReturn(l))));
}
export function sharedOptions(state: State, ownerIds: string[], now: number, leadSeconds = 7200, limit = 3): { options: MatchOption[]; reason?: 'venue' | 'time' } {
  const members = ownerIds.map(id => state.members.find(m => m.id === id)!);
  const venues = state.venues.filter(v => v.active && members.every(m => m?.venueIds.includes(v.id)));
  if (!venues.length) return { options: [], reason: 'venue' };
  const common = intersectWindows(members.map(m => m?.availability ?? []));
  const options: MatchOption[] = [];
  for (const venue of venues) {
    for (const window of intersectWindows([common, venue.windows])) {
      let start = Math.ceil(Math.max(window.start, now + leadSeconds) / 900) * 900;
      for (let accepted = 0; accepted < limit && start + 1800 <= window.end; start += 900) {
        const option = { venueId: venue.id, start, end: start + 1800 };
        if (!appointmentsConflict(state, ownerIds, [option])) { options.push(option); accepted++; }
      }
    }
  }
  options.sort((a, b) => a.start - b.start || a.venueId.localeCompare(b.venueId));
  return { options: options.slice(0, limit), reason: options.length ? undefined : 'time' };
}
export function validExactOption(state: State, ownerIds: string[], option: MatchOption, now: number, leadSeconds: number): boolean {
  if (option.start % 900 !== 0 || option.end !== option.start + 1800 || option.start < now + leadSeconds) return false;
  const venue = state.venues.find(v => v.id === option.venueId && v.active);
  if (!venue || !mergeWindows(venue.windows).some(w => w.start <= option.start && w.end >= option.end)) return false;
  return ownerIds.every(id => { const m = state.members.find(m => m.id === id); return m?.venueIds.includes(option.venueId) && mergeWindows(m.availability).some(w => w.start <= option.start && w.end >= option.end); });
}
type MatchContext = { items: Map<string, Listing>; options: Map<string, ReturnType<typeof sharedOptions>> };
export function candidateFromCycle(state: State, rawIds: string[], requesterId: string, now: number, leadSeconds = 7200, context?: MatchContext): { candidate?: Candidate; reason?: 'invalid' | 'venue' | 'time' } {
  if (![2, 3].includes(rawIds.length) || new Set(rawIds).size !== rawIds.length) return { reason: 'invalid' };
  const ids = canonicalCycle(rawIds);
  const eligible = context?.items ?? new Map(eligibleListings(state).map(l => [l.id, l]));
  const items = ids.map(id => eligible.get(id));
  if (items.some(l => !l)) return { reason: 'invalid' };
  const listings = items as Listing[];
  const owners = listings.map(l => l.ownerId);
  if (new Set(owners).size !== owners.length || !owners.includes(requesterId)) return { reason: 'invalid' };
  if (state.blocks.some(b => owners.includes(b.blockerId) && owners.includes(b.blockedId))) return { reason: 'invalid' };
  const transfers = listings.map((item, i) => {
    const recipient = listings[(i + 1) % listings.length];
    const rule = matchedRule(item, recipient);
    if (!rule) return undefined;
    const wantedName = rule.mode === 'catalog' ? state.catalog.find(c => c.id === rule.catalogId)?.name : state.categories.find(c => c.id === rule.categoryId)?.name;
    return { id: `${item.id}:${recipient.ownerId}`, listingId: item.id, giverId: item.ownerId, receiverId: recipient.ownerId, wantId: rule.id, wantVersion: rule.version, priority: rule.priority, reason: `${wantedName ?? 'Item'} meets the recipient's ${rule.minCondition === 3 ? 'excellent' : rule.minCondition === 2 ? 'good or better' : 'fair or better'} requirement.`, item: structuredClone(item) };
  });
  if (transfers.some(t => !t)) return { reason: 'invalid' };
  const optionKey = owners.slice().sort().join('|');
  const common = context?.options.get(optionKey) ?? sharedOptions(state, owners, now, leadSeconds);
  context?.options.set(optionKey, common);
  if (!common.options.length) return { reason: common.reason };
  const validTransfers = transfers.filter(t => !!t);
  return { candidate: {
    key: ids.map(id => `${id}@${listings.find(l => l.id === id)!.version}`).join('|'), listingIds: ids, transfers: validTransfers,
    participants: listings.map((l, i) => { const m = state.members.find(m => m.id === l.ownerId)!; return { userId: m.id, offeredId: l.id, incomingId: listings[(i - 1 + listings.length) % listings.length].id, listingVersion: l.version, memberVersion: m.version, preferenceVersion: m.preferenceVersion, vote: 'pending' as const }; }),
    options: common.options, requesterPriority: validTransfers.find(t => t.receiverId === requesterId)!.priority,
    minPriority: Math.min(...validTransfers.map(t => t.priority)), snapshotTime: now, policyVersion: state.policyVersion,
  } };
}
export function findMatches(state: State, requesterId: string, offeredIds: string[], now: number, budget = 100000) {
  const items = eligibleListings(state).slice(0, 250);
  const context: MatchContext = { items: new Map(items.map(l => [l.id, l])), options: new Map() };
  const offers = items.filter(l => l.ownerId === requesterId && offeredIds.includes(l.id)).slice(0, 3);
  const adjacency = new Map(items.map(a => [a.id, items.filter(b => matchedRule(a, b)).map(b => b.id)]));
  const found = new Map<string, Candidate>();
  let visited = 0, truncated = false, noVenue = 0, noTime = 0;
  const evaluate = (ids: string[]) => {
    if (++visited > budget) { truncated = true; return; }
    const result = candidateFromCycle(state, ids, requesterId, now, 7200, context);
    if (result.candidate) found.set(result.candidate.key, result.candidate);
    else if (result.reason === 'venue') noVenue++;
    else if (result.reason === 'time') noTime++;
  };
  search: for (const a of offers) for (const b of adjacency.get(a.id) ?? []) {
    if ((adjacency.get(b) ?? []).includes(a.id)) evaluate([a.id, b]);
    for (const c of adjacency.get(b) ?? []) {
      if (c !== a.id && (adjacency.get(c) ?? []).includes(a.id)) evaluate([a.id, b, c]);
      if (truncated) break search;
    }
  }
  const candidates = [...found.values()].sort((a, b) => b.requesterPriority - a.requesterPriority || b.minPriority - a.minPriority || a.options[0].start - b.options[0].start || a.participants.length - b.participants.length || a.key.localeCompare(b.key)).slice(0, 20);
  return { candidates, snapshotTime: now, policyVersion: state.policyVersion, truncated: truncated || state.listings.filter(l => l.status === 'active').length > 250, reason: candidates.length ? null : noTime ? 'no_common_time' : noVenue ? 'no_common_venue' : offers.length ? 'no_compatible_items' : 'offer_unavailable' };
}
