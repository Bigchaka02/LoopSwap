# Security and privacy

## Trust boundary

The browser has no database key or privileged service token. The Worker alone reads D1 and resolves current membership. Every resource/action is checked on the server; the request cannot choose its actor or role. Member/moderator authorization occurs before idempotency replay. Private loops return 404 to outsiders, and reports must concern an owner-visible or active/reserved visible item.

D1 has no per-user RLS or SQL function grants. Its binding is privileged. Triggers reject many forged transitions/ledger changes, but operators with schema-level access remain trusted. This release does not claim PostgreSQL RLS, RPC role tests, or cross-community isolation of a multi-community backend. There is one server-selected community.

## Authentication

Demo sessions use two random UUIDs as a nonce, SHA-256 hashes in D1, HttpOnly/SameSite=Strict cookies, Secure cookies on HTTPS, eight-hour expiry, and deletion on sign-out. There are no passwords. Only allowlisted synthetic identities are selectable, and the runtime and stored community must both be demo. Demo impersonation is deliberate within this isolated private product demo.

Pilot mode disables the demo entry route and ignores demo cookies. Sites SIWC identity headers are trusted only behind the platform dispatch boundary and must map to an existing active real membership. Never expose a standalone pilot Worker that trusts caller-supplied headers. The real hosted identity path and community/member provisioning are not verified or automated in this release. Do not convert a synthetic demo database into a real community by changing an environment flag.

Bootstrap reports awaiting-membership, suspended, and left status separately from anonymous sign-in. These status screens do not provision a member, reactivate access, expose private community records, or bypass the active-membership check on photos and mutations.

## Private data

Members see their full availability, venues, notification inbox and block list. Other members receive public display name/color and available item details, plus only common meetup slots. Each report author sees their own reports; moderators see relevant reports and exchange records. Ordinary participant event DTOs omit audit actorId/kind/operationId so block-review events cannot identify the blocker through metadata. Moderators retain full audit context.

Proposal item snapshots and recipient identities are visible to participants and moderators. Receipt notes are part of that authorized transfer record. Do not put unnecessary personal information in descriptions, notes, reports or moderator reasons.

## Web and input controls

Same-origin writes, Strict cookies, schema validation and 65,536-byte UTF-8 JSON request limits reduce cross-origin/request abuse. Binary photo uploads have their own bounded 1,000,000-byte stream limit. Nonces and database deadlines are authoritative. React renders user text without raw HTML. No user SVG/HTML upload path exists. Private API responses, uploaded images, and errors use no-store caching and nosniff. Diagnostic logs contain generic error/operation names, not request bodies, cookies, schedules, credentials or report details.

Account/listing actions cannot grant roles, edit another member's item, vote for another member, or manufacture another recipient's receipt. Moderator reasons and exact per-item outcomes are required. Stale moderator sequences are rejected to prevent overwriting newer evidence.

## Photos

The listing editor supports one optional photo when its private R2 binding is available. The three generated sample WebP assets remain public synthetic illustrations; uploaded photos use authenticated `/api/photos/:id` reads.

- The browser accepts JPG, PNG, or WebP up to 8,000,000 bytes and rejects decoded inputs over 25 megapixels. It applies orientation, limits each edge to 900 pixels, and prepares a JPEG of at most 1,000,000 bytes. Text-only listing remains available if preparation or storage fails.
- The server requires JPEG content type and signature, bounds the actual body stream, and independently decodes with strict decoding, resolution, and memory limits. It accepts neither edge above 900 pixels and re-encodes decoded pixels at JPEG quality 80. Source EXIF, location metadata, and comments are not copied into the stored output. A MIME header or client-prepared file alone is not sufficient validation.
- An active member can create at most 20 upload records per rolling 24 hours. A UUID request key and input hash identify an upload; retries preserve both key and bytes. D1 and object writes use durable `staged`/`ready` claims. Expired uploads transition through `deleting`/`deleted`; tombstones persist and reject resurrection under a stale upload request.
- Attaching a new photo requires a ready upload owned by the listing owner. Application checks verify its object; SQL guards independently reject invalid or foreign references and prevent cleanup while any listing or historical trade/loan item snapshot references the photo. Existing fixture photos may remain on their original listings.
- A ready photo is readable by its active uploader or an authorized moderator, by a member who can see its attached listing, and by authorized participants viewing its historical agreed-item snapshot. Draft or unattached photos do not become generally visible. Replacing or removing a current photo does not erase a historical agreement photo.
- Cleanup considers unused uploads older than 24 hours in bounded batches. It preserves every listing and agreement reference, records deletion work durably, and revisits old deleted tombstones to remove a late object left by an interrupted in-flight upload. Idempotent re-sweeps do not erase tombstones. The authenticated job and moderator maintenance control can run cleanup; neither implies that an external timer is configured.

Record this revision's automated photo checks in [testing](TESTING.md) after release verification. Deployed browser preparation, cache/access behavior, and visual/accessibility QA remain unverified here.

## Retention and leaving

Leaving marks a membership left, hides unreserved offers, stales pending proposals, and sends confirmed/review exchanges to review while retaining every uncertain hold and immutable history. This is community departure, not a complete personal-data erasure service. No unresolved handoff history is silently deleted.

Recent idempotency records are pruned after 48 hours during reconciliation. The authenticated job removes expired demo sessions and can process unreferenced uploads after 24 hours; referenced images and permanent upload tombstones are retained. A connected scheduler remains an operator requirement. Automatic report/history/notification archival, log-retention controls, and formal erasure/anonymization are not implemented. The blueprint's proposed retention periods need an operator policy and bounded privileged archive path before pilot use. No user-facing history retention period is claimed as an enforced deletion schedule.

| Proposed pilot default | Current enforcement |
|---|---|
| Raw application logs: 14 days | Provider policy not configured/audited |
| Proposal/event history: 90 days | Automated archive not implemented |
| Private reports: 90 days after closure | Automated retention not implemented |
| Idempotency: 48 hours | Pruned during reconciliation |
| Unreferenced uploaded photo: 24 hours | Eligible for bounded job/manual cleanup; referenced history and tombstones retained |

The state admission budget preserves recovery headroom; it is not a retention system. At capacity, new ordinary activity fails explicitly rather than risking partial holds. A real pilot requires archive/export work and moderation ownership.

## Release checks

Recorded tests cover private DTOs, outsider route access, forged actors, moderator denial, SQL corruption/role/vote/hold protection, cross-origin rejection, no-store headers, and pilot demo-route disablement. Current navigation, consent, upload, authorization, and cleanup results are recorded after this revision's release checks. Browser session/caching behavior, full accessibility, real SIWC provisioning, hosted logging/access configuration, backup/restore rehearsals, and complete retention remain external or unverified gates.


## Trade and lending release

The app now supports trade/lend/both listing modes, one-item loans with independent pickup and return acknowledgments, shared trade/loan reservations, moderator custody cases, and role-specific participant assessments. See [Loans and reliability](LOANS_REPUTATION.md) for the state machine, data and transaction rules, scoring weights, privacy, operator calendar workflow, and remaining pilot gates. The older trade-only descriptions above apply to the existing loop subsystem.
