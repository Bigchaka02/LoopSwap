import { describe, it, expect } from 'vitest';
import { canonicalCycle, candidateFromCycle, findMatches, matchedRule, mergeWindows, intersectWindows, sharedOptions } from '../../domain/matching';
import { createSeed, ALICE, BOB, CAROL, fixtureId } from '../../domain/seed';
import { localToUtc, utcToLocal } from '../../lib/time';
import type { State, Listing } from '../../domain/types';
import { FIXED_NOW as now } from '../helpers';
const offers = (s: State, owner = ALICE) => s.listings.filter(l => l.ownerId === owner).map(l => l.id);
describe('matching contract', () => {
  it('discovers the actual Alice → Carol → Bob → Alice ledger (A02)', () => {
    const s = createSeed(now), result = findMatches(s, ALICE, offers(s), now);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].transfers.map(t => [t.giverId, t.receiverId])).toEqual([[ALICE, CAROL], [CAROL, BOB], [BOB, ALICE]]);
    expect(result.candidates[0].transfers.map(t => t.wantId)).toEqual([fixtureId(303), fixtureId(302), fixtureId(301)]);
  });
  it('discovers direct swaps and rejects same-owner positions (A03)', () => {
    const s = createSeed(now);
    expect(findMatches(s, fixtureId(4), [fixtureId(104)], now).candidates.some(c => c.participants.length === 2 && c.listingIds.includes(fixtureId(105)))).toBe(true);
    s.listings.find(l => l.ownerId === CAROL)!.ownerId = BOB;
    expect(findMatches(s, ALICE, offers(s), now).candidates).toHaveLength(0);
    expect(candidateFromCycle(createSeed(now),[fixtureId(101),fixtureId(101)],ALICE,now).candidate).toBeUndefined();
  });
  it('canonicalizes rotations without merging reversals (A04)', () => {
    expect(canonicalCycle(['c','a','b'])).toEqual(['a','b','c']);
    expect(canonicalCycle(['b','a','c'])).toEqual(['a','c','b']);
    expect(canonicalCycle(['c','a','b'])).not.toEqual(canonicalCycle(['c','b','a']));
  });
  it('enforces exact catalog and minimum condition (A05)', () => {
    const s = createSeed(now);
    s.listings[1].condition = 1;
    expect(findMatches(s, ALICE, offers(s), now).candidates).toHaveLength(0);
    s.listings[1].condition = 2; s.listings[2].catalogId = null;
    expect(findMatches(s, ALICE, offers(s), now).candidates).toHaveLength(0);
  });
  it('excludes blocked, inactive and held members without revealing them (A05,A08)', () => {
    for (const change of ['block','inactive','reserved']) {
      const s = createSeed(now);
      if (change === 'block') s.blocks.push({ blockerId: CAROL, blockedId: ALICE });
      if (change === 'inactive') s.members[1].status = 'suspended';
      if (change === 'reserved') s.listings[1].status = 'reserved';
      const r = findMatches(s, ALICE, offers(s), now);
      expect(r.candidates).toHaveLength(0); expect(r.reason).toBe('no_compatible_items');
      expect(JSON.stringify(r)).not.toContain(CAROL);
    }
  });
  it('rejects pairwise-only venue and schedule intersections (A06)', () => {
    const s = createSeed(now); s.venues.push({ ...s.venues[0], id: 'third' });
    s.members[0].venueIds = ['library','union']; s.members[1].venueIds = ['union','third']; s.members[2].venueIds = ['library','third'];
    expect(findMatches(s, ALICE, offers(s), now).reason).toBe('no_common_venue');
    const t = createSeed(now), w = t.members[0].availability;
    t.members[0].availability = [w[0],w[1]]; t.members[1].availability = [w[1],w[2]]; t.members[2].availability = [w[0],w[2]];
    expect(findMatches(t, ALICE, offers(t), now).reason).toBe('no_common_time');
  });
  it('merges adjacent and overlapping windows before intersecting (A06,A07)', () => {
    expect(mergeWindows([{ start: 20, end: 40 }, { start: 0, end: 20 }, { start: 35, end: 45 }])).toEqual([{ start: 0, end: 45 }]);
    expect(intersectWindows([[{ start: 0, end: 30 }], [{ start: 20, end: 40 }], [{ start: 25, end: 28 }]])).toEqual([{ start: 25, end: 28 }]);
  });
  it('contains the entire slot in venue hours and enforces proposal lead (A07)', () => {
    const s = createSeed(now), first = s.members[0].availability[0].start;
    s.venues.forEach(v => v.windows = [{ start: first, end: first + 1799 }]);
    expect(sharedOptions(s, [ALICE, BOB, CAROL], now).options).toHaveLength(0);
    s.venues.forEach(v => v.windows = [{ start: first, end: first + 1800 }]);
    const options=sharedOptions(s, [ALICE, BOB, CAROL], now).options;
    expect(options.length).toBeGreaterThan(0);expect(options.every(o => o.end === first + 1800)).toBe(true);
    expect(sharedOptions(s,[ALICE,BOB,CAROL],first-7200).options[0].start).toBe(first);
    expect(sharedOptions(s,[ALICE,BOB,CAROL],first-7199).options).toHaveLength(0);
  });
  it('rejects daylight-saving gaps and ambiguous wall clocks (A07)', () => {
    expect(() => localToUtc('2026-03-08T02:30', 'America/New_York')).toThrow();
    expect(() => localToUtc('2026-11-01T01:30', 'America/New_York')).toThrow();
    const t = localToUtc('2026-10-01T14:00', 'America/Indiana/Indianapolis');
    expect(utcToLocal(t, 'America/Indiana/Indianapolis')).toBe('2026-10-01T14:00');
  });
  it('selects priority, specificity, then rule ID for explanations', () => {
    const s = createSeed(now), giver = s.listings[1], receiver = s.listings[0];
    receiver.wants = [{ id:'z',mode:'catalog',catalogId:'calculator',minCondition:2,priority:2,version:1 },{ id:'a',mode:'category',categoryId:'study',minCondition:2,priority:3,version:1 }];
    expect(matchedRule(giver, receiver)?.id).toBe('a');
    receiver.wants[1].priority = 2; expect(matchedRule(giver, receiver)?.id).toBe('z');
    receiver.wants.push({ ...receiver.wants[0], id:'b' }); expect(matchedRule(giver, receiver)?.id).toBe('b');
  });
  it('is independent of input order and signals an exhausted budget', () => {
    const s = createSeed(now), a = findMatches(s, ALICE, offers(s), now);
    s.listings.reverse(); s.members.reverse();
    expect(findMatches(s, ALICE, offers(s), now)).toEqual(a);
    expect(findMatches(s, ALICE, offers(s), now, 0).truncated).toBe(true);
  });
  it('agrees with an exhaustive independent enumerator on 60 random small graphs', () => {
    let random = 12345; const rand = () => ((random = (random * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let run = 0; run < 60; run++) {
      const s = createSeed(now); s.members = s.members.slice(0,6); s.listings = s.listings.slice(0,6);
      s.listings.forEach((l,i) => { l.ownerId = s.members[i].id; l.categoryId = s.categories[Math.floor(rand()*5)].id; l.catalogId = null; l.wants = [{ id:fixtureId(800+i),mode:'category',categoryId:s.categories[Math.floor(rand()*5)].id,minCondition:2,priority:2,version:1 }]; });
      const edge = (a: Listing,b: Listing) => a.ownerId !== b.ownerId && b.wants.some(w => w.categoryId === a.categoryId && a.condition >= w.minCondition);
      const keys = new Set<string>(), root = s.listings[0];
      const canon = (ids: string[]) => ids.map((_, i) => [...ids.slice(i),...ids.slice(0,i)].join('|')).sort()[0];
      for (const b of s.listings) if (edge(root,b)) {
        if (edge(b,root)) keys.add(canon([root.id,b.id]));
        for (const c of s.listings) if (new Set([root.ownerId,b.ownerId,c.ownerId]).size === 3 && edge(b,c) && edge(c,root)) keys.add(canon([root.id,b.id,c.id]));
      }
      const result = findMatches(s, ALICE, [root.id], now);
      expect(result.candidates.map(c => c.listingIds.join('|')).sort()).toEqual([...keys].sort());
      for(const candidate of result.candidates) {
        const ids=candidate.listingIds,ledger=ids.map((id,i)=>{
          const giver=s.listings.find(l=>l.id===id)!,recipient=s.listings.find(l=>l.id===ids[(i+1)%ids.length])!;
          const want=recipient.wants.find(w=>w.categoryId===giver.categoryId&&giver.condition>=w.minCondition)!;
          return {listingId:giver.id,giverId:giver.ownerId,receiverId:recipient.ownerId,wantId:want.id,wantVersion:want.version,priority:want.priority,item:giver};
        });
        expect(candidate.transfers.map(({listingId,giverId,receiverId,wantId,wantVersion,priority,item})=>({listingId,giverId,receiverId,wantId,wantVersion,priority,item}))).toEqual(ledger);
      }
    }
  });
});
