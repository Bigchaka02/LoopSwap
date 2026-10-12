# Product

LoopSwap serves members of one closed campus community who have one useful item to offer and several acceptable alternatives. It finds connections that a direct barter search can miss while keeping consent and physical handoff uncertainty visible.

## Main journeys

| Member | Journey | Result |
|---|---|---|
| Alice | Offer a bike lock; ask for a calculator | A discovered three-person loop |
| Bob and Carol | Review exactly what each gives/receives; independently vote | Either a complete reservation or an ended proposal |
| Maya and Ethan | Find reciprocal wants | A direct two-person swap |
| Any participant | Inspect an item and report their own receipt | Completion after every receipt and no open problem |
| Moderator | Review evidence and record every item's destination | Explicit resolution without manufacturing receipts |

The item form records ownership acknowledgement, category/catalog, condition, description, offer mode, and one optional photo with alternative text. Trade and Both require 1–5 OR wants; lend-only offers do not require barter wants and instead specify maximum duration and care/return instructions. Priorities express preference; they do not estimate value or guarantee fairness. A member may have three active/reserved items, initiate five trade proposals per rolling day, and have three initiated pending trade proposals.

## State wording

| State | User-facing meaning |
|---|---|
| PENDING | Everyone reviews one fixed plan. Nothing is reserved; another exchange can confirm first. |
| CONFIRMED | Everyone accepted and all digital item/member holds committed together. Recipients still need to report physical receipt. |
| NEEDS_REVIEW | A problem, unsafe cancellation, membership/block change, or overdue receipt needs review. All holds remain. |
| COMPLETED | Every recipient reported receipt and no problem remains open. Items are exchanged; holds are released. |
| RESOLVED | A moderator recorded each item's outcome. Participant receipts retain their original authors. |
| STALE / CONFLICTED / EXPIRED | Fresh consent is needed, a competing reservation won, or the response deadline passed. |

## Interface

The design uses a warm neutral canvas, evergreen actions, serif page headings, readable catalogue cards, a persistent navigation rail, a compact mobile menu, labelled forms, and a textual transfer ledger alongside the cycle illustration. The three fixture photos are generated examples. Members can add one private uploaded photo of their actual item, or publish a photo-free listing.

Routes: `/`, `/sign-in`, `/onboarding`, `/activity`, `/browse`, `/listings`, `/listings/new`, `/listings/:id`, `/listings/:id/edit`, `/matches`, `/loops`, `/loops/:id`, `/loans`, `/loans/:id`, `/members/:id`, `/settings`, `/help`, `/moderation`. Native links and same-origin imperative navigation reach these server-rendered pages without relying on framework client transitions. An anonymous demo visitor sees synthetic catalogue examples; private records require active membership. Awaiting-membership, suspended, and left screens explain access status without granting an account.

Browse mode, category, minimum condition, sort, and search are stored in the URL. Held-item management links open the authorized trade or loan, and item-specific trade discovery keeps the chosen offer. Known blocked members cannot initiate a new exchange together until unblocked; unblocking preserves existing agreement and review history.

Borrowing review freezes the displayed item/version. Appointment edits clear the agreement checkbox, and updated condition, terms, or availability requires explicit review again. Return input is checked against approved hours and the original maximum period. Only the borrower acknowledges pickup; only the lender acknowledges return. Trader, lender, and borrower histories remain separate, with observed dimensions and no invented new-member score.

## Action needed

The private `/activity` dashboard brings the signed-in member's next steps together. It derives tasks from the authorized bootstrap snapshot and server time, and links to the existing agreement or item form where the member can review and act.

| Area | Role-specific next steps |
|---|---|
| Trades | Respond to the member's pending vote; prepare for an upcoming meetup; report only the item the member personally received; follow an exchange in review |
| Loans | Lender approves a request; borrower prepares for or acknowledges pickup and plans/reports return; lender acknowledges return and inspects/closes the loan; parties follow extension or custody-review decisions |
| Feedback | An eligible direct participant can assess their partner within seven days of authoritative agreement closure |
| Own items | Review a draft or check and republish a paused item through its existing form |
| Meetup readiness | Review the member's own meetup preferences through `/settings?tab=meetups` |

Feedback deadlines come from server-supplied authoritative closure data, rather than a guessed appointment date or browser clock. The dashboard does not accept terms, record receipts, change listings, or apply reliability penalties. Each action still requires the existing role, state, version, deadline, and consent checks; a reminder is not evidence that a physical handoff happened. Empty task lists do not imply that the member or service is verified or pilot-ready.

## Future brainstorm backlog — unimplemented

| Idea | Scope to explore |
|---|---|
| Availability self-attestations | Let members describe their current readiness, clearly separate from peer-assessed availability and condition scores; do not create score evidence or consent |
| Calendar exports | Export agreed appointments with privacy controls and clear update/cancellation handling; calendar entries must not change agreed terms or report receipt |
| Saved searches | Save browse filters for easier repeat discovery; notification subscriptions and delivery would need separate design and implementation |

These are future ideas, not available features or connected services.

## Scope and success measures

Permanent trades support whole-item swaps with two or three distinct owners. Lending supports one item between one lender and one borrower, with shared cross-mode inventory holds. There is no cash, shipping, service exchange, bundling, bargaining chat, automatic valuation, ownership verification, or fairness guarantee. Reciprocal temporary swaps remain outside this release.

Useful future measures are proposals created, confirmation rate, reported completed transfers, time to confirmation, review rate, and review resolution time. The release has no fabricated success metrics or environmental savings claim. No analytics provider or production metrics dashboard is configured.


## Trade and lending release

The app now supports trade/lend/both listing modes, one-item loans with independent pickup and return acknowledgments, shared trade/loan reservations, moderator custody cases, and role-specific participant assessments. See [Loans and reliability](LOANS_REPUTATION.md) for the state machine, data and transaction rules, scoring weights, privacy, operator calendar workflow, and remaining pilot gates. The older trade-only descriptions above apply to the existing loop subsystem.
