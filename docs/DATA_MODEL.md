# Data model

The current implementation stores one community aggregate in D1. Members, listings/wants, categories/catalog, venues/windows, loops/participants/transfers/receipts, loans, assessments, blocks, reports, notifications, events, and recent idempotency records are typed JSON collections in `communities.state`. Private photo bytes live in R2 with durable D1 upload records and aggregate references. UUIDs identify entities; UTC epoch seconds identify times. This is not a normalized PostgreSQL schema.

## Relational tables

| Table | Key and purpose |
|---|---|
| `communities` | Text ID; immutable demo/pilot mode; revision, state, actor/operation metadata and database timestamp |
| `active_proposals` | `(community_id, loop_id)`; unique `(community_id, canonical_key)` across pending/confirmed/review loops |
| `item_holds` | `(community_id, listing_id)`; exactly one active hold per item |
| `loan_item_holds` | One active loan hold per item; guards conflict with permanent trade holds |
| `participant_holds` | `(community_id, user_id)`; exactly one active hold per member |
| `loop_events` | Event ID; community, immutable audit payload and timestamp |
| `notification_outbox` | Notification ID; event FK, recipient, payload and in-app delivery state; unique event/recipient |
| `demo_sessions` | SHA-256 token hash; member, community, expiry and creation time |
| `platform_identities` | Platform identity; unique member mapping and community FK; privileged pilot configuration |
| `photo_uploads` | UUID upload key; immutable owner/object/input hash/size/dimensions, rolling-day quota, lifecycle state and permanent cleanup tombstone |

Community FKs connect projections/sessions/identities to their aggregate. Loop and listing correspondence is validated by triggers because those entities live inside the aggregate. Hold-loop and session-expiry indexes support their actual lookup paths. Raw database access is privileged; table keys do not implement per-user SQL authorization.

## Entity states and versions

Listings: `draft`, `active`, `reserved`, `paused`, `exchanged`, `removed`. Membership: `active`, `suspended`, `left`; role: `member` or `moderator`. Loop states and transitions are documented in [transactions](TRANSACTIONS.md). Votes: pending/accepted/declined. Report state: open/closed. Item outcomes: recipient/original_owner/unresolved.

Listings have a material version; wants have rule versions. Members have membership and preference versions. Proposals freeze policy and input versions with `version=1`; ordinary votes/events increment `sequence`, not the terms version. Moderator resolutions require the current sequence as well as terms version.

A listing allows `trade`, `lend`, or `both`; older missing mode means trade. A loan freezes one item and separate pickup/return appointments, with accepted extension history and recipient-authored custody evidence. Role-specific assessments preserve their answers and append moderator decisions. See [Loans and reliability](LOANS_REPUTATION.md).

A listing has one nullable photo URL and photo alternative text. Uploaded images use `/api/photos/:id`. `photo_uploads` moves through `staged`, `ready`, `deleting`, and `deleted`; identity, owner, input hash, object key, dimensions, and creation time cannot be rewritten. Deleted tombstones are retained and can be re-swept after 24 hours to recover late object writes; the workflow does not delete the upload record.

## Database invariants

Before an UPDATE, triggers validate revision, mode, actor, protected membership, listing ownership/quota/types, exact catalogue relationships, distinct ledger items/owners, directed transfers, immutable snapshots/terms, canonical key, wants, current input versions, consent authority, database deadline, common full slot, allowed transitions, recipient receipts, safe cancellation, completion and outcomes. Duplicate JSON object keys and entity identities are rejected.

After the same UPDATE, projections atomically create/release item and participant holds, synchronize active keys, append events, and insert one outbox record per event/recipient. Hold timestamps survive unrelated commits. Required holds cannot be deleted while the stored loop remains confirmed/reviewed. Stored event payloads cannot be updated; application history remains immutable. A privileged database operator can still change schema or bypass the application boundary.

UTF-8 state must remain below 1.5 MB. The API's lower admission budgets reserve recovery capacity; an archive operation must be designed before this model supports long-running pilot history.

Photo guards reject a changed listing reference unless it points to a ready upload owned by that listing's owner. Upload creation requires active membership, at most 20 records per rolling day, JPEG byte size at most 1,000,000, and dimensions from 1 to 900 pixels on each edge. Cleanup cannot claim a photo referenced by any listing or historical loop/loan item snapshot. This protection covers direct SQL attempts through the guarded schema as well as application operations. Private read authorization remains in the Worker; a database key is not a member-level permission boundary.

## Migrations and reset policy

| Migration | Purpose |
|---|---|
| 0000 | Generated eight-table schema and unique indexes |
| 0001 | Transition/ledger validation and atomic projections |
| 0002 | Type, quota, snapshot, want, outcome and hold hardening |
| 0003 | Exact item-set equality, transition authority, receipt/expiry safety |
| 0004 | Actual UTF-8 capacity and empty-loop initialization |
| 0005 | Restrict resolution listing-state checks to resolution time, allowing owner republication later |
| 0006 | Add durable loan-item hold projection and loan/trade reservation guards |
| 0007 | Add private upload claims, dimensions/quota/ownership/reference guards and permanent tombstones |

Use `pnpm db:migrate` and `pnpm db:check` for the local built app. Both use `--local`; they cannot target a hosted database. Apply all checked-in migrations and record current results after release checks. Earlier empty-database results do not establish an upgraded hosted schema boundary. Tests separately apply every SQL migration to fresh SQLite and Miniflare D1 databases.

Applied migration SQL, journal entries and snapshots are immutable. Append a new migration. Sites applies its own recorded migrations before Worker upload; a failed deployment may have applied part of the schema. Do not rewrite an uncertain applied boundary or replay schema over existing tables using another migration registry.

There is no hosted reset route or destructive seed script. The guarded demo initializer inserts only if no community exists. Local recovery should preserve the existing database, use a separate empty local state directory/checkpoint, and verify migrations before restoring data. An arbitrary migration rollback is not guaranteed; prefer a forward repair after a validated backup.


## Trade and lending release

The app now supports trade/lend/both listing modes, one-item loans with independent pickup and return acknowledgments, shared trade/loan reservations, moderator custody cases, and role-specific participant assessments. See [Loans and reliability](LOANS_REPUTATION.md) for the state machine, data and transaction rules, scoring weights, privacy, operator calendar workflow, and remaining pilot gates. The older trade-only descriptions above apply to the existing loop subsystem.
