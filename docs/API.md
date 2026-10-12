# API

All responses use `Cache-Control: private, no-store, max-age=0`, cookie/identity variation and `nosniff`. Actor identity comes from the server session, never a request's actor field. Strict schemas reject unexpected fields.

## Routes

| Method and route | Contract |
|---|---|
| GET `/api/health` | D1 required-table query, schema generation, and photo-binding availability; not a full integrity or pilot-readiness check |
| GET `/api/bootstrap` | Active member's private DTO; inactive/anonymous status without private records; anonymous demo gets synthetic examples |
| GET `/api/listings` | Active authorized items; `category`, numeric `condition`, UUID `cursor`; 20-item page and `nextCursor` |
| GET `/api/listings/:id` | Public active/reserved or own visible listing; otherwise 404 |
| GET `/api/loops`, `/api/loops/:id` | Participant or moderator only |
| POST `/api/demo/session` | Allowlisted fictional member; demo-only random session, guarded empty-community initialization |
| POST `/api/sign-out` | Delete demo session and cookie |
| POST `/api/matches` | `offeredIds: UUID[1..3]`, all owned by current member; bounded candidates and safe reason |
| POST `/api/listings`, PATCH `/api/listings/:id` | `listing.save` contract below |
| POST `/api/loops` | Immutable `loop.propose` contract below |
| POST `/api/loops/:id/vote`, `/cancel`, `/problem` | Participant operation with resource ID supplied by route |
| POST `/api/transfers/:id/receipt` | Intended recipient's receipt; owning loop found on server |
| POST `/api/moderation/:id/resolve` | Moderator resolution with versions and all item outcomes |
| POST `/api/action` | Strict `{operation,payload}` envelope for named app operations |
| POST `/api/photos` | Active member's bounded JPEG upload with a UUID request key; private photo URL and dimensions |
| GET `/api/photos/:id` | Authorized ready uploaded image; owner/moderator, visible attached listing, or historical agreement participant |
| GET `/api/maintenance` | Moderator-only aggregate capacity, hold/review counts, photo binding and job-authentication status |
| POST `/api/maintenance/photos` | Moderator-only bounded unused-upload/tombstone cleanup; repeatable operation |
| POST `/api/jobs/reconcile` | Server bearer secret; deadline reconciliation, expired demo sessions and photo cleanup; no member impersonation |

The bootstrap includes `feedbackOpportunities: [{kind, referenceId, closesAt}]` for only the signed-in member's eligible direct agreements with no prior assessment. Closure determines the seven-day deadline on the server; equality remains eligible. Anonymous/inactive responses return an empty list. Moderator access to a case does not create a participant opportunity. The read-only `/activity` page derives role-specific suggestions from this snapshot; it does not add a mutation endpoint.

Member writes require the exact same Origin. Aggregate mutations use a JSON body no larger than 65,536 UTF-8 bytes and a UUID `Idempotency-Key`. Photo upload instead uses `Content-Type: image/jpeg`, a bounded binary body of at most 1,000,000 bytes, and its own UUID request key. Sign-in/out, matching, option reads, and repeatable moderator cleanup do not require an aggregate mutation key. No GET performs fixture initialization. Authenticated reads may perform idempotent deadline reconciliation.

## Mutation contracts

| Operation | Fields |
|---|---|
| `listing.save` | Optional `id/expectedVersion` for edit; title 3–80, description ≤1000, categoryId, nullable catalogId, condition 1–3, wants 0–5 (trade needs ≥1), offer mode/loan terms, optional owned photo and photoAlt ≤160, publish boolean, ownershipConfirmed=true |
| `listing.pause`, `listing.remove` | Owned `id`, `expectedVersion` |
| `profile.save` | Name 2–60, valid IANA timezone; does not alter proposal terms |
| `preferences.save` | Current `expectedVersion`, approved venueIds, future UTC windows within seven days, 15-minute boundaries, ≥30 minutes |
| `loop.propose` | Directed listingIds 2–3, each participant snapshot's userId/listingVersion/memberVersion/preferenceVersion, exact `{venueId,start,end}`, accepted=true |
| `loop.vote` | `id`, expectedVersion, vote `accept`/`decline` |
| `loop.cancel` | `id`, expectedVersion |
| `loop.receipt` | `id`, transferId, optional note ≤500; recipient and clock checked server-side |
| `loop.problem`, `report.listing` | Visible `id`, kind condition/missing_item/no_show/inappropriate/other, details 5–1000 |
| `member.block` | Other member `id`, blocked boolean |
| `member.delete` | Empty payload; leaves community while retaining unresolved history/holds |
| `notification.read` | Own notification `ids`, at most 100 |
| `moderation.suspend`, `moderation.listing` | Target `id`, reason 5–500; moderator only |
| `moderation.resolve` | `id`, expectedVersion, **expectedSequence**, reason 10–1000, one outcome per listing: recipient/original_owner/unresolved |

A want has optional existing `id`, mode category/catalog, exactly the corresponding categoryId/catalogId, minCondition 1–3 and priority 1–3. The server assigns new entity IDs and rule versions.

## Example using the real matcher result

In an already signed-in browser, this creates an actual proposal with a fresh key and current snapshots:

```js
const result = await fetch('/api/matches', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ offeredIds: ['00000000-0000-4000-8000-000000000101'] })
}).then(r => r.json());
const c = result.data.candidates[0];
const response = await fetch('/api/loops', {
  method: 'POST', headers: {
    'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID()
  },
  body: JSON.stringify({
    listingIds: c.listingIds,
    snapshots: c.participants.map(({ userId, listingVersion, memberVersion, preferenceVersion }) =>
      ({ userId, listingVersion, memberVersion, preferenceVersion })),
    option: c.options[0], accepted: true
  })
});
```

Only run a creation example when you intend to accept the complete plan. For a transport retry, preserve both the same key and identical body; do not generate a new key.

The browser action client validates the response's `operationId` against the submitted key before acknowledging success. Unreadable or incomplete success replies, network interruptions, timeout responses, and uncertain upstream errors retain the key. Only an acknowledged success or a structured definitive rejection clears it. Identical in-flight actions share one send; signatures include the member and canonical payload. Pending keys live in the current page's memory and do not survive a reload.

## Results and errors

Aggregate mutations return `{data,serverTime,operationId}`; data includes the affected listing/loop/loan ID and current state where applicable. Ordinary community read responses include `{data,serverTime}`; matches include snapshotTime/policyVersion/truncated/reason. Listing pages additionally return nextCursor. Health and maintenance have their own documented response fields; photo upload returns `{data:{photo,width,height}}`, and photo reads return authenticated JPEG bytes.

Errors use `{error:{code,message,retryable,fields?}}`: 400 validation, 401 unauthenticated, 403 forbidden, 404 unavailable/private resource, 409 stale/conflict, 429 rate/capacity limit, 503 retryable database failure. Fields use schema paths. SQL constraint failures expose no private payload or SQL text. A returned ended state may be a valid operation result (for example acceptance after reconciliation returns EXPIRED), not a server error.

## Browser tools

The page feature-detects `document.modelContext` and registers `read_campus_items`, `find_swap_matches`, and `cast_loop_vote`. Inputs are strictly validated; vote uses the same authenticated mutation and visible refresh as the button. Registration cleans up with an AbortSignal. Tools cannot set an actor or bypass server rules. Supported-browser registration/input/action validation remains unavailable in this environment; source/build checks are not claimed as WebMCP validation.


## Loans, assessments, and venue hours

Authenticated `GET /api/loans` lists a participant's own loans (moderators see the case set); `GET /api/loans/:id` applies the same party/moderator scope. `POST /api/loan/options` accepts `{listingId}` and exposes shared pickup options plus approved public return-venue hours, without either member's private availability. `GET /api/listings?mode=trade` or `mode=lend` filters available, unheld inventory.

All commands below use `POST /api/action`, the existing `{operation,payload}` envelope, same-origin checks, and a UUID `Idempotency-Key`. Strict schemas reject extra identity fields. Loan identities use `{id,expectedSequence}`; original terms remain version 1.

| Operation | Payload beyond the loan identity | Authorization |
| --- | --- | --- |
| loan.request | listingId, expectedVersion, pickup, returnSlot, accepted:true; no loan identity yet | Borrower |
| loan.vote | vote:accept/decline | Lender |
| loan.cancel | None | Either party |
| loan.pickup | note | Borrower only |
| loan.return.report | None | Borrower only |
| loan.return | note | Lender only |
| loan.close | None | Lender after acknowledged return/inspection |
| loan.problem | details | Either party |
| loan.extend | returnSlot | Borrower |
| loan.extension.vote | extensionId, vote:accept/decline | Lender |
| moderation.loan.resolve | outcome:owner/lost/unresolved, reason | Moderator |

`listing.save` additionally accepts `offerMode:trade/lend/both`, `maxLoanDays:1..14`, and `loanTerms` up to 500 characters. Lend-only listings may have an empty wants array; trading requires at least one structured want.

`review.submit` accepts `{kind:trade/loan,referenceId,transferId? ,answers,note}`. Trade reviews require the recipient's incoming transfer ID; loan reviews omit it. Reviewer, subject, and role are derived on the server. `review.dispute` accepts `{id,reason}` from the assessed member after publication. `moderation.review.resolve` accepts `{id,expectedDecisions,outcome:supported/excluded,reason}`.

`moderation.venue` accepts `{id,windows:[{start,end}]}`. Windows use 15-minute boundaries, minimum 30-minute duration, and a 30-day horizon; an empty array closes available hours. Venue identities and member availability remain separately protected.

Bootstrap adds scoped `loans`, safe `reviews` with a derived `published` flag, `reputations` per member and role, a derived listing `loanHeld` flag, and moderator-only `venueWindows`. Loan events/notifications use `loanId`. See [Loans and reliability](LOANS_REPUTATION.md) for exact workflow rules.

Bootstrap also exposes `authStatus` (`anonymous`, `active`, `awaiting_membership`, `suspended`, or `left`), `photosEnabled`, and an active-member `matchingToken` derived from material matching state. These fields describe current server state; they do not grant permissions or prove a connected scheduler.

## Private item photos

Use the listing editor to prepare JPG/PNG/WebP input of at most 8 MB as JPEG with edges at most 900 pixels. The server independently requires bounded JPEG pixels, strict decoding and metadata-free re-encoding; direct PNG/WebP or malformed uploads fail validation. The upload response's `/api/photos/:id` URL can be attached only to its owner's listing when its durable record is ready and the object exists. `photo:null` removes a current attachment; historical agreed-item snapshots retain their photo references. Unchanged generated fixture images remain supported.

Each member can create 20 upload records per rolling 24 hours. Repeating identical bytes with the same key reuses the claim; a changed body conflicts, and deleted/expiring keys cannot resurrect an object. Staged/ready/deleting/deleted records persist through failure recovery. Cleanup processes bounded batches, preserves every listing and agreement reference, and retains deletion tombstones. See [security/privacy](SECURITY_PRIVACY.md) and [operations](OPERATIONS.md) for access rules and the external scheduling requirement.
