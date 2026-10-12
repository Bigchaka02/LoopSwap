import { COMMUNITY_TIMEZONE, type Listing, type Member, type State, type Want } from './types';
export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ALICE = fixtureId(1), BOB = fixtureId(2), CAROL = fixtureId(3), MODERATOR = fixtureId(16);
export function createSeed(now: number): State {
  const start = Math.ceil((now + 86400) / 900) * 900;
  const windows = Array.from({ length: 6 }, (_, i) => ({ start: start + i * 86400, end: start + i * 86400 + 14400 }));
  const categories = [
    { id: 'books', name: 'Books & textbooks', shortName: 'Books', color: '#e8edf4' },
    { id: 'study', name: 'Study essentials', shortName: 'Study', color: '#efedf5' },
    { id: 'games', name: 'Board games', shortName: 'Games', color: '#f6eddd' },
    { id: 'tools', name: 'Simple hand tools', shortName: 'Tools', color: '#e9ede7' },
    { id: 'accessories', name: 'Everyday accessories', shortName: 'Accessories', color: '#e4efec' },
  ];
  const catalog = [
    { id: 'bike-lock', categoryId: 'accessories', name: 'Bicycle lock' },
    { id: 'calculator', categoryId: 'study', name: 'Scientific calculator' },
    { id: 'economics', categoryId: 'books', name: 'Introductory economics textbook' },
    { id: 'chess', categoryId: 'games', name: 'Chess set' },
    { id: 'sketchbook', categoryId: 'study', name: 'Sketchbook' },
  ];
  const names = ['Alice Martin', 'Bob Chen', 'Carol Davis', 'Maya Patel', 'Ethan Brooks', 'Sofia Rivera', 'Noah Wilson', 'Ava Thompson', 'Liam Foster', 'Zoe Kim', 'Oliver Reed', 'Isla Morgan', 'Leo Park', 'Amelia Scott', 'Finn Hayes', 'Jamie Harper'];
  const colors = ['#dbe9e1', '#e5e0f0', '#f0e4d7', '#dce7f0', '#ece5df'];
  const members: Member[] = names.map((name, i) => ({ id: fixtureId(i + 1), name, timezone: COMMUNITY_TIMEZONE, role: i === 15 ? 'moderator' : 'member', status: 'active', version: 1, preferenceVersion: 1, availability: structuredClone(windows), venueIds: ['library', 'union'], color: colors[i % colors.length], joinedAt: now - 86400 * (i + 4) }));
  const want = (n: number, mode: Want['mode'], id: string, priority = 2): Want => ({ id: fixtureId(300 + n), mode, ...(mode === 'catalog' ? { catalogId: id } : { categoryId: id }), minCondition: 2, priority, version: 1 });
  const base: Omit<Listing, 'id' | 'ownerId' | 'title' | 'categoryId' | 'catalogId' | 'wants'> = { description: '', condition: 2, status: 'active', version: 1, photo: null, photoAlt: '', createdAt: now };
  const listings: Listing[] = [
    { ...base, id: fixtureId(101), ownerId: ALICE, title: 'A trusty bike lock', description: 'A sturdy U-lock with two keys. Some light scuffs, but it works perfectly. Looking for a calculator for this semester.', categoryId: 'accessories', catalogId: 'bike-lock', wants: [want(1, 'catalog', 'calculator', 3)], photo: '/images/bike-lock.webp', photoAlt: 'Sample black U-shaped bicycle lock with a key' },
    { ...base, id: fixtureId(102), ownerId: BOB, title: 'Scientific calculator', description: 'Used for one semester. All keys and the screen work. Ready for another round of problem sets.', categoryId: 'study', catalogId: 'calculator', wants: [want(2, 'catalog', 'economics', 3)], photo: '/images/calculator.webp', photoAlt: 'Sample black scientific calculator' },
    { ...base, id: fixtureId(103), ownerId: CAROL, title: 'Intro to Economics', description: 'A blue hardback introductory economics textbook. A few pencil notes inside, with all pages intact.', categoryId: 'books', catalogId: 'economics', wants: [want(3, 'catalog', 'bike-lock', 3)], photo: '/images/textbook.webp', photoAlt: 'Sample blue economics textbook' },
  ];
  const samples = [
    ['Wooden chess set', 'games', 'chess'], ['A fresh sketchbook', 'study', 'sketchbook'], ['The Thursday Murder Club', 'books', null], ['Canvas tote bag', 'accessories', null], ['Pocket screwdriver set', 'tools', null], ['Catan board game', 'games', null], ['Campus notebook', 'study', null], ['Reusable water bottle', 'accessories', null], ['A collection of short stories', 'books', null], ['Small hand tool kit', 'tools', null], ['Travel Scrabble', 'games', null], ['Graph paper notebook', 'study', null], ['Knitted winter scarf', 'accessories', null], ['Introduction to Psychology', 'books', null], ['Compact measuring tape', 'tools', null], ['Uno card deck', 'games', null], ['Watercolor pencils', 'study', null], ['Weekend daypack', 'accessories', null], ['A well-loved novel', 'books', null], ['Adjustable wrench', 'tools', null], ['Bananagrams game', 'games', null], ['Desk organizer', 'study', null], ['Insulated lunch bag', 'accessories', null], ['World history reader', 'books', null], ['Needle-nose pliers', 'tools', null], ['Playing card set', 'games', null], ['A5 dotted journal', 'study', null], ['Wool beanie', 'accessories', null], ['Poetry anthology', 'books', null], ['Mini sewing kit', 'tools', null], ['Ticket to Ride', 'games', null], ['Index card collection', 'study', null], ['Sunglasses case', 'accessories', null],
  ] as const;
  for (let i = 0; i < samples.length; i++) {
    const [title, categoryId, catalogId] = samples[i];
    const owner = fixtureId(4 + i % 12);
    // First two create a separate direct swap; no sample alters the main three-person fixture.
    const wants = i === 0 ? [want(i + 10, 'catalog', 'sketchbook')] : i === 1 ? [want(i + 10, 'catalog', 'chess')] : [want(i + 10, 'category', categories[(i + 2) % categories.length].id)];
    listings.push({ ...base, id: fixtureId(104 + i), ownerId: owner, title, description: `${title}, owned by a fictional demo member. Clean, usable, and ready for its next owner. Please inspect it together at the meetup.`, categoryId, catalogId, condition: i % 3 === 0 ? 3 : 2, wants, createdAt: now - (i + 1) * 3600 });
  }
  return { mode: 'demo', policyVersion: 1, members, listings, categories, catalog, venues: [
    { id: 'library', name: 'Campus library entrance', description: 'Meet by the main entrance, beside the outdoor benches.', accessibility: 'Step-free entrance and accessible seating.', active: true, windows: structuredClone(windows) },
    { id: 'union', name: 'Student union courtyard', description: 'Meet at the covered tables by the east entrance.', accessibility: 'Level access, covered seating, and nearby accessible restrooms.', active: true, windows: structuredClone(windows) },
  ], loops: [], blocks: [], problems: [], events: [], notifications: [], idempotency: [] };
}
