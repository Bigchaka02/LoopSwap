# Progress

Current milestone: navigation, loan-consent, private-photo, and operator-readiness refinements are implemented for the isolated synthetic demo. Current verification results and the exact source/deployment revision are recorded after release checks. Browser and pilot release gates below remain open.

Latest development batch: a private Action needed dashboard and direct meetup-settings links. Verification: 113 unit/SQLite tests and 25 compiled Worker/D1/R2 groups, plus strict types, lint, and production build. Earlier refinements include safe client retries after lost or malformed replies, shared sends for identical in-flight actions, and filter-preserving browse search.

## Completed

- All required app screens, functional listing/want/preferences forms, catalogue browsing, exact match discovery, proposal/approval, receipt/review, notifications, privacy and moderation.
- Directed two/three-cycle matcher with exact full ledgers, whole-group scheduling, immutable terms, bounded ranking and snapshot-scoped performance reuse.
- Hashed synthetic sessions, server identity/membership resolution, private DTOs, Origin/body limits, idempotency and safe committed-write refresh recovery.
- Actual D1 persistence, ten tables, eight append-only migrations, atomic unique trade/loan item holds and trade participant holds, audit and in-app outbox projections.
- Recipient-only receipts, completion/cancellation, overdue retained holds, evidence-based moderator outcomes and returned-item republication.
- Independent read-only engineering review; reachable republication, event metadata, private-draft report and refresh-retry defects corrected with regressions where practical.
- Requested engineering documentation, secret-free environment examples, tested toolchain metadata and operator-run browser script.
- Native anchor navigation, validated same-origin action destinations, reloadable query filters, direct held-item agreement links, stale-response guards, and reviewed loan terms that invalidate changed consent.
- Optional one-photo private upload pipeline with browser preparation, independent strict server validation/re-encoding, owner-only attachment, SQL reference guards, rolling quota, and durable bounded unused-upload cleanup.
- Separate trader/lender/borrower reliability and moderator venue-hour/readiness controls; inactive authentication status and schema-query health reporting.

## Previously recorded checks

These results belong to the initial trade-only revision. They are retained as historical evidence; current revision results are recorded after release verification in [Testing](TESTING.md).

- Unit/SQLite suite: 34 passed, including a synchronized two-connection race and injected rollback at reservation and completion.
- Compiled Worker/native D1: 14 checks passed, independent cookies, actual auth/routes, idempotency, concurrent confirmations, review, pilot demo disablement, 250-item benchmark.
- Strict types, lint and production build passed; latest source is checked again during publication.
- Empty local D1: all six migrations applied; `quick_check=ok`. The earlier local development database was preserved before this exercise.
- Dense 250-item D1 match: seven runs, approximately 0.74s cold, 0.54s warm median; full HTTP/D1/matcher/response path.
- Hosted runtime explicitly configured `LOOPSWAP_MODE=demo` for the private synthetic community.

## Blocked or unverified

The permitted managed browser preview is unavailable. No independent browser receipt journey, real product screenshots, keyboard/screen-reader/responsive visual QA or WebMCP browser validation has run. Full fresh-clone browser setup has not been independently executed.

The available implementation differs from the PostgreSQL/Supabase blueprint. Real pilot provisioning and membership verification, named moderators and recurring venue-hour ownership, a monitored external minute scheduler with its secret, archival/retention policy, backup restore rehearsal, alerts, and deployed browser/accessibility QA remain release gates. Private photo validation and cleanup are implemented; configured storage and a job secret alone do not establish unattended operation.

## Next concrete actions

1. On each change, build/package the exact pushed source and preserve owner-private publication; retain its confirmed deployment URL/version.
2. When the supervised preview is available, run the supplied three-context browser script and manual A26/WebMCP checks; respect actual meetup time for receipts.
3. Before any real pilot, provision a separate real community and membership/moderation path, run authenticated minute reconciliation, establish archival/retention, rehearse restore, name moderation owners, and complete deployed browser/accessibility QA.


## 2026-10-10 — Trade and lending implementation

Implemented Trade/Lend/Both offers, one-item lending agreements, shared reservation guards, separate pickup/return claims and acknowledgments, accepted extensions, custody review, role-specific reliability, blind feedback/disputes, public member history, mode filters, and operator venue hours. Existing trade records and the private synthetic community are preserved.

That revision recorded 62 unit/SQLite tests and 17 compiled Worker/D1 checks. Types, lint, and production build are included in release verification. Browser visual/accessibility QA remains unverified because the permitted preview is unavailable. Detailed implementation and remaining pilot gates are in [Loans and reliability](LOANS_REPUTATION.md).

## 2026-10-10 — Navigation, consent, and private-photo refinements

Replaced client router links with native anchors, validated action destinations, retained query filters across reloads, and added active-agreement links for held items. Loan requests capture reviewed listing terms and invalidate consent when material terms or selected appointments change. Existing directed trade consent and recipient-only receipts are preserved.

Added one optional private photo with browser JPG/PNG/WebP preparation and independent server JPEG decode/re-encode validation. D1 upload claims, ownership/reference guards, rolling quota, permanent lifecycle tombstones, and bounded 24-hour unused cleanup support recoverable object writes. Moderator readiness reporting and actual schema-query health checks are available.

Verification: strict types, lint, production build, 83 unit/SQL tests, and 23 compiled Worker/D1/R2 check groups passed. The eight-migration chain is checked on empty isolated databases. Detailed evidence and development timings are in [Testing](TESTING.md); hosting version records identify the exact pushed source and deployment. Browser QA remains unverified because the supported control-browser skill is unavailable. External pilot gates above remain open.

## 2026-10-11 — Retry and search refinements

The client now requires the action response to acknowledge its exact request key. Malformed or interrupted responses keep uncertain requests retryable with that key, including HTTP 200 replies missing the result. Identical concurrent submissions share one request; payload ordering is normalized and keys are scoped to the member. Definitive rejections and acknowledged success release the key. Browse search keeps the chosen exchange mode, category, condition, and sort.

Verification includes 92 unit/SQL tests and 24 compiled Worker/D1/R2 check groups. The fault check commits a listing in actual D1, replaces its successful reply with unreadable HTML, then retries through the client: the original key is replayed and exactly one listing exists. Pending client keys remain page-memory state; reload recovery and browser QA are not claimed. Existing pilot gates remain open.

## 2026-10-11 — Action needed dashboard development

This batch adds `/activity` to collect the member's role-specific trade votes, upcoming meetups/receipts, loan approvals, pickup/return/inspection, extension and review steps, seven-day feedback, draft/paused items, and own meetup-readiness guidance. Tasks use private bootstrap data and server time and open the existing agreement/item forms. Feedback deadlines are supplied by the server from authoritative closure data. Account meetup preferences can be reached directly with `/settings?tab=meetups`.

The dashboard performs no automatic consent, receipt, listing change, or reliability penalty. Immutable directed trade terms, recipient-only trade receipts, borrower pickup acknowledgment, lender return acknowledgment, and separate role scores remain authoritative. Availability self-attestations separate from peer scores, calendar exports, and saved searches are listed as unimplemented future ideas in [Product](PRODUCT.md).

Verification includes 113 tests (46 unit and 67 actual SQLite), 25 compiled Worker/D1/R2 groups, strict types, lint, and the production build. Tests cover role/privacy boundaries, inclusive feedback expiry, real committed feedback suppressing reminders, accepted versus pending extensions, receipt-opening clocks, inactive selected venues, and waiting review cases after supplied evidence. The published Sites version identifies the exact pushed source; detailed evidence is in [Testing](TESTING.md). No browser/accessibility QA or pilot-readiness claim is added; the existing external release gates remain open.
