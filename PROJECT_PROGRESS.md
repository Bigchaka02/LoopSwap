# LoopSwap project progress

LoopSwap helps a closed campus community trade ownership through direct two-person swaps or directed three-person loops, and lend one item with agreed pickup and return appointments. The current application is an isolated synthetic demo; a real-member pilot has not been verified.

- Source import destination: [Bigchaka02/LoopSwap](https://github.com/Bigchaka02/LoopSwap).
- Existing website: [LoopSwap campus](https://loopswap-campus.bigchaka02.chatgpt.site). Hosting remains owner-private; publishing source does not change its audience.
- Start here: [README](README.md). Detailed release history: [Progress](docs/PROGRESS.md). Evidence and limitations: [Testing](docs/TESTING.md).

## Project goals

1. Discover feasible swaps from stored item wants, condition thresholds, member preferences, and approved shared meetup times.
2. Make the full directed transfer plan clear before each participant accepts; preserve agreed terms and independent consent.
3. Reserve every required item together, including conflicts between trade and lending, while keeping physical custody separate from digital acceptance.
4. Support recipient-authored receipts, private problems, retained holds during uncertain handoffs, and evidence-based moderator outcomes.
5. Make lending pickup, return, extensions, inspection, and closure understandable without changing ownership.
6. Show separate trader, lender, and borrower histories from eligible participant observations, with no invented scores for new members.
7. Keep listing, discovery, availability setup, and next-step guidance usable while protecting private schedules, reports, and uploaded photos.

See [Product](docs/PRODUCT.md), [Matching](docs/MATCHING.md), and [Loans and reliability](docs/LOANS_REPUTATION.md) for the current scope.

## Development steps

| Step | Current implementation |
|---|---|
| Establish the demo and trust boundary | One synthetic community, fictional identities, hashed demo sessions, private server DTOs, and a separate pilot authentication mode |
| Build inventory and discovery | Listing/want/preferences forms, URL-backed browse filters, and exact directed two/three-person matching |
| Persist agreement integrity | D1 revision/database-clock comparisons, immutable snapshots, append-only migrations, atomic hold/audit/outbox projections, and idempotent actions |
| Handle physical handoffs | Recipient-only trade receipts, safe cancellation, overdue review, per-item outcomes, and explicit returned-item republication |
| Add lending and reliability | Trade/Lend/Both offers, one-item loans, independent pickup/return acknowledgments, accepted extensions, blind feedback, and disputes |
| Improve navigation and recovery | Native anchors, same-origin action destinations, reviewed loan consent, stale-response guards, and retries that retain uncertain request keys |
| Add photos and operator controls | One optional private photo, strict server validation, durable upload cleanup, venue-hour management, schema health, and service-readiness reporting |
| Bring next steps together | Private `/activity` tasks, server-supplied feedback deadlines, and `/settings?tab=meetups` links to existing forms |
| Prepare the public source import | Complete source snapshot with user README, project progress, and prioritized notes; verification is recorded below |

The implementation uses React/Vinext on Workers with D1 SQLite and optional private R2 storage. It differs from the original PostgreSQL/Supabase design. See [Architecture](docs/ARCHITECTURE.md), [Data model](docs/DATA_MODEL.md), [Transactions](docs/TRANSACTIONS.md), and [Decisions](docs/DECISIONS.md).

## Dated milestones

Dates and results below come from existing project records. Test counts describe their checked revision, not an automatically renewed verification of the import snapshot.

| Recorded date | Milestone | Recorded evidence/status |
|---|---|---|
| 2026-09-30 | Initial architecture decisions documented | Hosting/backend choices, revisioned aggregate, explicit authentication, and physical-transfer uncertainty recorded in [Decisions](docs/DECISIONS.md) |
| 2026-10-10 | Trade and lending implementation | Trade/Lend/Both, custody lifecycle, cross-mode holds, role feedback, and venue hours; 62 unit/SQLite tests and 17 compiled Worker/D1 checks recorded |
| 2026-10-10 | Navigation, consent, and private photos | Native links, frozen loan review, photo claims/reference guards/tombstones, and readiness controls; 83 unit/SQL tests and 23 Worker/D1/R2 groups recorded |
| 2026-10-11 | Retry and search refinements | Exact action acknowledgment, shared identical sends, retained uncertain keys, and filter-preserving search; 92 unit/SQL tests and 24 Worker/D1/R2 groups recorded |
| 2026-10-11 | Action needed dashboard | Role-specific private tasks, authoritative feedback deadlines, and meetup-settings links; 113 tests and 25 Worker/D1/R2 groups recorded |
| 2026-10-12 | Public source handoff | Complete source, assets, migrations, lockfile, and documentation; 113 tests, 25 compiled runtime groups, types, lint, and build passed |

## Completed implementation

- Listing management, wants, meetup preferences, browsing, matching, proposals, independent votes, and notifications.
- Directed immutable trade plans and atomic reservations; only the intended recipient can report a trade receipt.
- One-item lending with a borrower pickup acknowledgment, lender return acknowledgment, inspected closure, and custody review.
- Separate role reliability, seven-day blind participant feedback, observation limits, and reasoned disputes.
- Private optional photo uploads with ownership/reference guards, bounded input and pixel validation, rolling quota, and recoverable cleanup tombstones.
- Moderator venue calendars and readiness controls; explicit inactive-membership screens and database schema-query health.
- Action needed guidance that links to existing forms without automatically accepting terms, recording receipts, changing listings, or applying score penalties.

The initial demo contains 16 fictional members and 36 listings. It does not fabricate completed exchanges or real-member history. See [Demo](docs/DEMO.md).

## Verification status

The latest prior recorded release passed **113 tests: 46 unit tests and 67 actual SQLite integration tests**, plus **25 compiled Worker/D1/R2 groups**, strict types, lint, and the production build. Recorded migration checks cover the eight-migration chain on isolated empty databases. These checks exercise real persisted transactions and compiled handlers; HTTP clients are not browser sessions.

Fresh source-handoff verification on **2026-10-12** passed `pnpm lint`, `pnpm typecheck`, `pnpm test` (113 tests), `pnpm build`, and `pnpm test:worker` (25 groups). Eight migrations applied successfully to an isolated local D1 database. Documentation links and included source/assets were checked. Dependency installation was reused locally; an independent fresh dependency install and browser setup remain unverified. The source snapshot has 203 files and excludes earlier development Git history, credentials, private runtime records, dependencies, and generated build/cache files. Its GitHub commit is the import commit shown in this repository history; use `git rev-parse HEAD` to identify a checked-out revision. The existing hosting deployment was confirmed successful and active; no new runtime deployment or browser QA result is claimed for this documentation/source import. See [Testing](docs/TESTING.md) for the evidence boundary.

## Unverified work and pilot gates

- Deployed mouse/navigation, keyboard, screen-reader, responsive/zoom, private-image/cache behavior, WebMCP, and independent-browser full receipt journeys remain unverified. The permitted browser workflow was unavailable in the recorded runs.
- Independent full fresh-clone browser setup remains unverified. Native document and HTTP checks do not close that gap.
- A real pilot needs a separate real community, audited identity mapping and membership approval, accountable moderators, venue-hour ownership, and evidence/appeal procedures.
- The authenticated reconciliation endpoint exists, but an actual monitored minute scheduler and its server secret still need operational setup.
- Backups, an isolated restore rehearsal, archive/retention and erasure policy, and alerts remain required. Capacity admission limits do not replace archival.
- Production load, deployed Worker CPU limits, and long-running history growth need measurement; recorded container timings are not a service guarantee.

Runbooks and boundaries are in [Operations](docs/OPERATIONS.md) and [Security and privacy](docs/SECURITY_PRIVACY.md). Prioritized next work and owner decisions are in [TODO notes](TODO_NOTES.md).

## 2026-10-13 — Automated repository verification

Added `.github/workflows/verify.yml` for pushes to `main`, pull requests, and manual runs. It pins checkout/Node/pnpm actions to their release commit SHAs, uses the recorded toolchain, performs a fresh frozen dependency install with the project workspace/build policy intact, runs `pnpm verify`, applies all migrations to isolated local D1, and checks database integrity. Repository permissions are read-only and checkout credentials are not retained. This workflow does not deploy, read production storage, or run browser previews. The first GitHub-run outcome is pending until reported here.

Local README setup now retains `pnpm-workspace.yaml` during installation so its native dependency build policy is applied.
