export type ListingStatus = 'draft' | 'active' | 'reserved' | 'paused' | 'exchanged' | 'removed';
export type LoopState = 'PENDING' | 'CONFIRMED' | 'NEEDS_REVIEW' | 'COMPLETED' | 'RESOLVED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED' | 'STALE' | 'CONFLICTED';
export type TimeWindow = { start: number; end: number };
export type Want = { id: string; mode: 'category' | 'catalog'; categoryId?: string; catalogId?: string; minCondition: number; priority: number; version: number };
export type Member = { id: string; name: string; timezone: string; role: 'member' | 'moderator'; status: 'active' | 'suspended' | 'left'; version: number; preferenceVersion: number; availability: TimeWindow[]; venueIds: string[]; color: string; joinedAt: number };
export type OfferMode = 'trade' | 'lend' | 'both';
export type Listing = { id: string; ownerId: string; title: string; description: string; categoryId: string; catalogId: string | null; condition: number; status: ListingStatus; version: number; wants: Want[]; photo: string | null; photoAlt: string; createdAt: number; offerMode?: OfferMode; maxLoanDays?: number; loanTerms?: string; loanHeld?: boolean };
export type Category = { id: string; name: string; shortName: string; color: string };
export type CatalogItem = { id: string; categoryId: string; name: string };
export type Venue = { id: string; name: string; description: string; accessibility: string; active: boolean; windows: TimeWindow[] };
export type MatchOption = { venueId: string; start: number; end: number };
export type Transfer = { id: string; listingId: string; giverId: string; receiverId: string; wantId: string; wantVersion: number; priority: number; reason: string; item: Listing; receipt?: { recipientId: string; receivedAt: number; note: string }; outcome?: 'recipient' | 'original_owner' | 'unresolved' };
export type Participant = { userId: string; offeredId: string; incomingId: string; listingVersion: number; memberVersion: number; preferenceVersion: number; vote: 'pending' | 'accepted' | 'declined'; voteAt?: number };
export type Candidate = { key: string; listingIds: string[]; transfers: Transfer[]; participants: Participant[]; options: MatchOption[]; requesterPriority: number; minPriority: number; snapshotTime: number; policyVersion: number };
export type Loop = { id: string; initiatorId: string; key: string; listingIds: string[]; transfers: Transfer[]; participants: Participant[]; venueId: string; start: number; end: number; deadline: number; state: LoopState; version: number; sequence: number; policyVersion: number; createdAt: number; terminalReason?: string; resolution?: string };
export type Event = { id: string; loopId: string | null; loanId?: string; actorId: string; kind: string; at: number; message: string; operationId: string };
export type Notification = { id: string; eventId: string; recipientId: string; loopId: string | null; loanId?: string; message: string; createdAt: number; readAt?: number };
export type Problem = { id: string; actorId: string; loopId: string | null; listingId: string | null; kind: string; details: string; status: 'open' | 'closed'; createdAt: number; resolution?: string };
export type Idempotency = { actorId: string; operation: string; key: string; hash: string; result: unknown; at: number };
export type LoanState = 'REQUESTED' | 'RESERVED' | 'ON_LOAN' | 'RETURN_REPORTED' | 'RETURNED' | 'NEEDS_REVIEW' | 'CLOSED' | 'RESOLVED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED' | 'STALE' | 'CONFLICTED';
export type LoanReceipt = { recipientId: string; reportedAt: number; note: string };
export type LoanExtension = { id: string; requestedAt: number; returnSlot: MatchOption; status: 'pending' | 'accepted' | 'declined'; decidedAt?: number };
export type LoanIssue = { id: string; authorId: string; details: string; createdAt: number };
export type Loan = { id: string; listingId: string; lenderId: string; borrowerId: string; item: Listing; pickup: MatchOption; returnSlot: MatchOption; deadline: number; createdAt: number; memberVersions: [number, number]; preferenceVersions: [number, number]; state: LoanState; version: 1; sequence: number; custody: 'owner' | 'borrower' | 'unknown' | 'lost'; pickupReceipt?: LoanReceipt; returnReceipt?: LoanReceipt; returnReportedAt?: number; extensions: LoanExtension[]; issues: LoanIssue[]; reason?: string; resolution?: string; closedAt?: number };
export type ReviewRole = 'trader' | 'lender' | 'borrower';
export type FeedbackOpportunity = { kind: 'trade' | 'loan'; referenceId: string; closesAt: number };
export type Review = { id: string; kind: 'trade' | 'loan'; referenceId: string; transferId?: string; reviewerId: string; subjectId: string; role: ReviewRole; answers: Record<string, 'yes' | 'no' | 'unknown'>; note: string; createdAt: number; publishAt: number; status: 'submitted' | 'disputed' | 'supported' | 'excluded'; dispute?: string; decisions: { at: number; moderatorId: string; status: 'supported' | 'excluded'; reason: string }[] };
export type State = { mode: 'demo' | 'pilot'; policyVersion: number; members: Member[]; listings: Listing[]; categories: Category[]; catalog: CatalogItem[]; venues: Venue[]; loops: Loop[]; loans?: Loan[]; reviews?: Review[]; blocks: { blockerId: string; blockedId: string }[]; problems: Problem[]; events: Event[]; notifications: Notification[]; idempotency: Idempotency[] };
export type Snapshot = { state: State; revision: number; now: number };
export const ACTIVE_LOOPS: LoopState[] = ['CONFIRMED', 'NEEDS_REVIEW'];
export const ACTIVE_LOANS: LoanState[] = ['RESERVED', 'ON_LOAN', 'RETURN_REPORTED', 'RETURNED', 'NEEDS_REVIEW'];
export function loanHeld(state: State, listingId: string) { return (state.loans ?? []).some(l => l.listingId === listingId && ACTIVE_LOANS.includes(l.state)); }
export function tradeEnabled(item: Listing) { return item.offerMode !== 'lend'; }
export function lendEnabled(item: Listing) { return item.offerMode === 'lend' || item.offerMode === 'both'; }
export function currentReturn(loan: Loan): MatchOption { return loan.extensions.filter(e => e.status === 'accepted').at(-1)?.returnSlot ?? loan.returnSlot; }
export const CONDITION_NAMES: Record<number, string> = { 1: 'Fair', 2: 'Good', 3: 'Excellent' };
export const PRIORITY_NAMES: Record<number, string> = { 1: 'Low', 2: 'Normal', 3: 'High' };
export const COMMUNITY_TIMEZONE = 'America/Indiana/Indianapolis';
