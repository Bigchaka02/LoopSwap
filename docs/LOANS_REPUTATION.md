# Trade, lending, and participant reliability

This release keeps the existing two- and three-person ownership trades and adds one-item, two-person loans. A listing can allow `trade`, `lend`, or `both`. A missing mode on an older listing means trade; existing persisted listings are not globally rewritten. Lending does not require a trade want. Reciprocal temporary swaps, deposits, fees, insurance, shipping, and loan-to-trade conversion are not implemented.

## Agreements and custody

A loan freezes the item description, condition, maximum duration, care instructions, parties, membership/preference versions, pickup, and return appointment. Borrower requests hold nothing. Lender acceptance rechecks both memberships, blocks, versions, the item, venue calendar, appointments, and borrower capacity before acquiring a durable item hold. A member can have at most two active borrowing agreements, three pending requests, and five requests per rolling day. A decline has a one-hour request cooldown for that lender.

The request dialog captures the listing version and terms being reviewed. A refreshed listing, changed availability/hold, or edited pickup/return selection invalidates the checked consent; the borrower must review the latest terms before submission. The server still rejects stale versions. Empty or failed approved-slot lookups provide availability/retry paths rather than inventing a time. Held listings link the owner to the active agreement.

Pickup must be a shared 30-minute approved venue slot with two hours of lead time. Return is an explicitly accepted 30-minute appointment at an approved open venue, at least one day after pickup and within the listing's 1–14-day maximum. The return appointment does not infer consent from either member's unpublished availability.

| State | Custody meaning | Item held? |
| --- | --- | --- |
| REQUESTED | Borrower requested frozen terms; awaiting lender | No |
| RESERVED | Lender accepted; no pickup acknowledgment | Yes |
| ON_LOAN | Borrower acknowledged receiving the item | Yes |
| RETURN_REPORTED | Borrower claimed return; lender has not acknowledged | Yes |
| RETURNED | Lender acknowledged receipt; inspection/closure remains | Yes |
| NEEDS_REVIEW | Overdue, disputed, or uncertain custody | Yes |
| CLOSED | Pickup and return acknowledged, lender inspected and closed | No; listing paused |
| RESOLVED | Moderator recorded owner or lost disposition | No; listing paused or removed |
| DECLINED / CANCELLED / EXPIRED / STALE / CONFLICTED | Request ended or safe pre-pickup cancellation | No |

Only the borrower acknowledges pickup; only the lender acknowledges receiving the item back. Reporting opens ten minutes before pickup. Ordinary return/closure requires pickup evidence. An owner can report physical possession during review without manufacturing a borrower acknowledgment. Review closure is then a moderator decision. Recorded timestamps are report-save times, not independent proof of physical handoff.

Safe cancellation is allowed before pickup starts and before pickup acknowledgment. Later cancellation enters review. Missing pickup or return reporting enters review two hours after its appointment ends. Due time alone, a borrower return claim, or unresolved moderator findings never release a hold. Block, suspension, departure, and listing moderation preserve active custody cases. Inactive owners' offers are hidden from other members.

Extension requests append immutable proposed return slots. The existing due appointment applies until the lender accepts, before that appointment starts. Acceptance checks the current approved venue calendar and overlapping appointments. Extensions stay within the original maximum loan period; historical accepted terms survive venue calendar maintenance.

Decision dialogs retain the reviewed sequence. Extension choices respect the original maximum return date, and acceptance controls are unavailable after the current due appointment starts. Return and review actions remain available through the appropriate custody states. A closed or resolved owner-return agreement links the owner to check the item and republish its paused listing.

After an inspected closure or resolved return, the source listing is paused and its version advances. Its owner must check its condition and republish. Ownership never changes through a loan. A confirmed loss removes the listing. Source descriptions cannot change while a loan holds the item.

## Storage and integrity

The existing D1 community aggregate remains authoritative. Loans and reviews are optional new arrays for backward compatibility. All writes use database-clock/revision compare-and-swap, existing idempotency hashing, and authorization before cached replay.

Migration `0006_fancy_karma.sql` appends a `loan_item_holds` projection and guard triggers without changing any previously applied migration. Hold-bearing states match the domain constants. NEW JSON is checked for cross-mode conflicts before either projection executes; both hold tables also guard direct writes. Source state, holds, events, and the notification outbox commit or roll back together. Terminal loan records, acknowledgments, agreed terms, extension history, and assessment answers are immutable.

The matcher and final trade approval exclude loan-held inventory. Participants remain free to have other agreements at different times; loan pickup/return appointments must not overlap other agreed appointments. Recovery commands have reserved snapshot capacity for returns, issues, closure, custody resolution, and assessment disputes.

## Participant reliability

Assessment eligibility comes from a closed agreement's direct leg. A trader assesses the giver of the item they were agreed to receive; they do not assess unrelated members in a three-person loop. A borrower assesses the lender, and a lender assesses the borrower. Client payloads cannot choose reviewer, subject, or role. Acknowledgment absence forces unobserved condition/care answers; absent pickup also forces unobserved borrower return timing.

| Role | Weighted dimensions |
| --- | --- |
| Trader | Agreed item availability 40%; description/condition honesty 40%; handoff commitments 20% |
| Lender | Agreed item availability 40%; description/condition honesty 40%; loan terms 20% |
| Borrower | Accepted return timing 35%; item care 35%; honest disclosure 20%; coordination 10% |

Each answer is Yes, No, or Did not observe. Unknown answers contribute neither positive nor negative evidence. Accurately disclosed fair condition is honest condition, rather than a negative assessment. Normal agreed wear is allowed in the care question. Actual exchange eligibility establishes participation; an allegation is still participant testimony.

Feedback can be submitted once within seven days of closure. It stays blind until every direct participant assessment arrives or the seven-day deadline passes. Scores use only published eligible assessments. A dimension percentage appears after three observed answers. A role headline appears after five assessed agreements with three distinct partners and at least three observations in every dimension. It is the weighted average of positive-answer rates. Empty histories remain unscored; no synthetic history, prestige badge, or automatic suspension is generated.

The assessed member can dispute published feedback. Pending disputes leave the aggregate. A moderator records a reasoned support/exclusion decision without editing the answers. Excluded contents are hidden from unrelated members while retained for the parties and moderator. Decision history is append-only. Closed moderator decisions are not reopened by the ordinary dispute endpoint; a further appeal requires operator handling.

## Privacy and operator calendar

Loan detail, exact appointments, receipts, issues, activity, and notifications are restricted to the parties and moderators. Other campus members see a derived held-item flag and published reliability summaries/assessments, without the private dispute evidence. Anonymous sample browsing does not show actual community histories.

An optional uploaded item photo is private and attached only by its owner. Draft photos are visible to their owner and moderators; frozen historical photos remain accessible to authorized agreement participants. Historical agreement references prevent unused-photo cleanup from deleting their evidence. See [Security and privacy](SECURITY_PRIVACY.md) for the upload and retention controls.

Moderators can publish or remove approved venue hours within 30 days. They cannot rewrite venue identity or private member preferences through that operation. Pending affected requests need fresh agreement. Outstanding appointments that lose their venue coverage enter review. Historical completed pickups do not need to remain in the current opening calendar. An empty calendar prevents new agreements there.

The existing private synthetic demo's expired calendar is preserved on upgrade. To try future agreements, Jamie publishes future venue hours under Moderation → Venue hours, and participating fictional members choose their own future availability under Account. The app does not silently renew user consent or reset existing records. Moderation → Service readiness reports database capacity, holds, review cases, photo storage, and whether a job secret is configured; it does not establish that an external scheduler or other pilot services are running.

## Verification and remaining gates

The SQLite suite covers custody, observation limits, competing agreements, compare-and-swap, injected projection failures, stale sequences, overdue reconciliation, membership changes, calendar maintenance, feedback direction/publication/disputes, excluded-content privacy, and direct-write guards. Compiled Worker/D1 checks cover the authenticated request flows, holds, receipt clocks, idempotent retries, moderator dispositions, feedback, calendar authorization, privacy, and existing trade behavior.

Visual, keyboard, screen-reader, and independent-browser full physical-receipt journeys remain unverified in this managed environment because the permitted supervised preview was unavailable. The demo remains synthetic and private. A real pilot still needs operator-provisioned identities, an authenticated scheduler, evidence/appeal procedures, history retention/archival, backups, and the previously documented operational release gates.
