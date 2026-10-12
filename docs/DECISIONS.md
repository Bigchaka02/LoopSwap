# Decisions

Initial decisions recorded 2026-09-30 against the supplied LoopSwap Project Blueprint and AI Handoff; current release updates recorded 2026-10-10.

## D01 — Deliver an isolated demo on the available hosting stack

Supabase/PostgreSQL and Docker executables were unavailable. Sites supplies Vinext/Workers and private D1, so the functioning release uses those services. Strict TypeScript, structured graph matching and transaction invariants are preserved. PostgreSQL RLS/RPC architecture and real-service tests are not claimed. A real pilot needs either an explicitly audited D1 model/provisioning path or a deliberate migration to the blueprint backend.

## D02 — Use a revisioned aggregate with relational hold/audit projections

D1 transactions can execute one validated UPDATE with trigger projections atomically. Computing outside its write lock and comparing both revision and database second makes consent safe under competing requests. Item/member primary keys independently prevent overlapping holds. This is bounded to one small community; normalized storage, archival and scale work remain necessary for a long-running pilot.

## D03 — Keep authentication explicit and fail closed

The private demo has no real users or passwords. Random hashed sessions represent only allowlisted fictional members. Pilot mode disables demo entry, uses trusted Sites identity and requires operator mapping to real membership. Public role assignment/provisioning is absent. A no-service-key browser and separate demo database are required; real identity onboarding remains a release gate.

## D04 — Preserve physical-transfer uncertainty

Digital reservation does not prove handoff. Only recipients author receipts. Unsafe cancellation, reports, overdue receipts and affected membership/block changes retain all holds in review. Moderators record evidence and item outcomes, never receipts. Returned items pause until the owner verifies and republishes them.

## D05 — Enable photos through a bounded private pipeline

Text-only listings remain functional and three generated fixture illustrations remain static WebP assets. The current editor supports one optional actual-item photo through a private R2 binding. Client JPG/PNG/WebP preparation is followed by strict bounded server JPEG decoding and metadata-free re-encoding, active-member authorization, owner-only attachment, and SQL reference guards. Durable upload claims, deletion tombstones, and bounded cleanup preserve retries and historical photos across separate object-store/database operations. External cleanup scheduling and deployed photo/browser checks remain explicit gates.

## D06 — Use one real persisted source of truth

No localStorage/sessionStorage ledger or hardcoded candidate responses exist. Match results come from stored wants, versions, memberships and schedules. Server refresh/reconnect controls the interface. A known committed write remains successful even if its following refresh fails; uncertain transport retries retain an idempotency key.

## D07 — Append schema repairs

Applied migrations are preserved. Migration 0003 adds ledger/transition safety; 0004 enforces UTF-8 capacity; 0005 fixes returned-item republication by checking status at resolution time rather than forever against historical outcomes. Migration 0006 adds loan reservation protections; 0007 adds durable private-upload claims and photo ownership/reference/tombstone guards. No deployed schema or seeded state is silently reset. Record the current revision's checks after release verification.

## D08 — Measure performance and preserve semantics

The initial dense 250-listing CPU benchmark took about 4.2 seconds warm. Snapshot-scoped eligible-item lookup and shared-slot reuse reduced warm CPU median to about 0.62 seconds; actual compiled Worker/D1 HTTP warm median measured about 0.54 seconds. Oracle/ordering/ledger tests continued to pass. These measurements describe this container, not a production guarantee.

## D09 — Mark unavailable release gates honestly

The supervised managed preview service had no request directory; the troubleshooting policy disallows reconstructing it or starting a substitute server/browser route. Therefore browser screenshots, accessibility, three-browser receipt completion and WebMCP context validation remain unverified. The supplied browser script reports missing prerequisites/receipt timing explicitly. No HTTP-client result is labelled a browser pass.

## D10 — Leave operating dependencies visible

The authenticated reconciliation endpoint and request-time deadline checks exist. Moderators have venue-calendar, readiness, and bounded unused-photo cleanup controls. The job can reconcile custody, prune expired demo sessions, and process photo cleanup. External minute scheduling with a secret, operator provisioning/membership approval, backup/restore rehearsal, recurring venue-hours ownership, history/report/log archival and retention, and accountable moderation remain pilot requirements. Ordinary aggregate admission stops early, reserving recovery capacity, but capacity limits are not archival. Demo publication does not imply pilot readiness.

## D11 — Keep navigation and reviewed consent independent of background refresh

Native anchors and validated same-origin imperative navigation replace reliance on framework client transitions for primary app journeys. Query parameters preserve browse filters and item-specific discovery. Loan review captures the displayed listing/version and action sequence; later refreshes cannot silently update accepted terms. Changed appointment inputs clear acceptance and changed offers require explicit review. These are source implementation choices, not a claim of completed deployed-browser or accessibility QA.
