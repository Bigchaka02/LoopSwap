# Testing and acceptance

**This is an isolated synthetic demo, not a fully verified pilot.** Tests below ran against real implementations. HTTP cookie clients are not browser sessions; source inspection is not accessibility or WebMCP validation.

## Commands and recorded results

The table below records the initial trade-only revision. Later lending results are recorded separately below. Current navigation/private-photo release results are recorded after verification; historical counts are not current totals.

| Command | Recorded result |
|---|---|
| `pnpm lint` | Passed, zero reported warnings/errors after refinements |
| `pnpm typecheck` | Passed, strict TypeScript |
| `pnpm test` | 34 passed: 12 matcher/timezone tests, 22 actual SQLite transaction tests |
| `pnpm build` | Production Worker/client build passed |
| `pnpm test:worker` | 14 actual compiled Worker/native D1 checks passed |
| `pnpm benchmark` | Seven dense 250-listing pure matcher runs; measured result in MATCHING.md |
| `pnpm db:migrate`, `pnpm db:check` | All six migrations on empty local D1; `quick_check=ok` |
| `pnpm test:e2e` | Unverified; approved browser preview unavailable, no replacement server used |

Unit and SQLite runs use fixed test database time 1790780000. SQLite's registered `unixepoch()` is a deterministic test clock, not a mocked database or mocked transaction result. Worker/D1 tests use native database time and real compiled request handlers, nonce cookies and persisted state. Every suite applies all migration SQL to empty databases.

## A01–A30 mapping

`U` = tests/unit/matching.test.ts; `I` = tests/integration/transactions.test.ts; `W` = tests/worker/workflow.mjs. “Verified” means the described SQLite/D1 evidence in this implementation; it does not assert unrun PostgreSQL tests or production load results.

| ID | Status and concrete evidence |
|---|---|
| A01 | Verified core: I/W owned create/edit/publish, wants, catalog and invalid-condition rejection, frozen inventory |
| A02 | Verified: U/W discover exact Alice → Carol → Bob ledger and selected rules from actual data |
| A03 | Verified: U reciprocal cycle, repeated owner/item rejection |
| A04 | Verified: U rotation/reversal handling and input-order-independent results |
| A05 | Verified: U eligibility/catalog/condition/blocks; I/W current holds and distinct participant constraints |
| A06 | Verified: U pairwise-only counterexamples, all-party intersection, merged windows; I persisted normalization |
| A07 | Verified core: U DST gaps/ambiguities, UTC conversion, complete venue end and exact two-hour lead boundary |
| A08 | Partial: U safe reasons; I public block-event metadata privacy; rendered explanation browser check unverified |
| A09 | Verified: I/W pending has zero holds; immutable full terms and independent votes |
| A10 | Verified: I/W whole reservation; trigger failure leaves zero partial holds |
| A11 | Verified: I two synchronized independent SQLite connections; W concurrent native D1/Worker requests; one whole loop wins |
| A12 | Verified core: I material edit stales consent; SQL forbids term substitutions. Explicit preference/suspension race matrix not exhaustive |
| A13 | Verified core: I authoritative deadline and changed database-second CAS; W native receipt time. External delayed scheduler not configured |
| A14 | Verified core: W exact key/body replay and changed-body 409. Full expired-key/revoked-member replay matrix not run |
| A15 | Verified: I injected failure during reservation and during completion hold release; persisted state/audit/outbox/holds unchanged |
| A16 | Verified: I recipient-only/duplicate-event suppression; W wrong-recipient and early-clock rejection |
| A17 | Verified SQLite lifecycle: all receipts archive items/release every hold; partial/open problem retains review. Native browser completion unverified |
| A18 | Verified core: I pre-meetup, exact-start, partial/problem cancellation retains/releases appropriately. Receipt/cancel race matrix not exhaustive |
| A19 | Verified core: I overdue, unresolved retention, returned outcomes/republication, stale moderator sequence; W real moderator resolution, no forged receipts. Mixed outcome branch matrix not exhaustive |
| A20 | Partial scope: W outsider/unauthenticated access; I corrupt ledger/private-draft report denial. Single community and private binding replace requested RLS/RPC design |
| A21 | Verified demo core: I role/vote/ownership/privacy safeguards; W forged actor/moderator denial. Provisioned real SIWC path unverified |
| A22 | Implemented private photo pipeline: browser preparation; server strict JPEG decode/re-encode and byte/dimension caps; owner-only attachment, private reads, quota/idempotency, SQL reference guards, and recoverable tombstone cleanup. Current automated results are recorded after release checks; deployed browser upload QA remains unverified |
| A23 | Partial: W actual cookie reconnect/idempotency; client polling and committed-write refresh recovery implemented. Browser tab-close/offline/retry scenarios unverified |
| A24 | Verified: I active-item limit plus pending/daily proposal caps and decline cooldown, including direct SQL bypass attempts |
| A25 | Unverified: independent HTTP clients cover consent; three independent browsers completing receipts not run |
| A26 | Unverified browser gate: labels/skip link/dialogs/reduced motion/text ledger and contrast refinements implemented; no keyboard/screen-reader/viewport certification claimed |
| A27 | Partial: install/build used, fresh local D1 migrations and isolated SQLite/D1 seed tested, documented scripts provided. Independent full fresh-clone/browser setup not run |
| A28 | Partial: W no-store/private headers and DTOs; source diagnostics omit sensitive payload. Hosted logs/cache retention not audited |
| A29 | Partial: I repeated overdue reconciliation/outbox deduplication and retained holds; atomic failure proofs. External scheduler/crash-delivery system not configured |
| A30 | Verified demo/pilot separation: W pilot demo-entry 404 and unprovisioned identity 401; no browser service key or destructive reset. Hosted real pilot auth remains unverified |

## Concurrency and fault method

The SQLite race opens two actual file-backed connections in worker threads. Both compute a final acceptance from the same revision, signal ready, then a SharedArrayBuffer barrier releases both writes. Exactly one conditional UPDATE succeeds; the other reloads and becomes CONFLICTED. Persisted item/member hold counts are checked after both finish. W independently sends simultaneous final acceptances through compiled handlers/native D1.

Fault tests use actual aborting SQLite triggers: one fails before participant-hold insertion after item projection starts; another fails during final completion hold deletion. Both check aggregate/revision, item/member holds, events and notification rows. The latter removes the injected fault and retries successfully.

The randomized oracle enumerates small directed graphs independently and compares canonical identities and full giver/recipient/rule/version/priority/item ledgers. It uses a deterministic random seed for reproducibility.

## Browser gate

In an explicitly permitted preview environment, install Playwright Chromium, set `LOOPSWAP_E2E_BASE_URL` to that isolated demo preview, then run `pnpm test:e2e`. The script starts no server. Missing prerequisites produce exit 78 and UNVERIFIED.

The script opens three isolated cookie contexts, signs in through the actual UI, proposes/accepts, reloads the confirmed state, saves actual desktop/mobile screenshots, and checks mobile horizontal overflow plus the keyboard skip link. It respects the native receipt clock. Before the meetup window it exits **2/PARTIAL**, records the missing receipt gate, and does not claim completion. At receipt time, re-run with `LOOPSWAP_E2E_LOOP_ID` to finish all three receipt dialogs against persisted data.

Manual A26 still needs keyboard order, select/dialog escape and focus restoration, zoom, 360/390/768/1440 viewports, contrast from computed styles, errors/live regions, and screen-reader reading of the ledger. WebMCP needs supported-browser registration, valid action/read-back and invalid-input checks for every tool. No permitted supported context was available here.

## Environment differences and performance

PostgreSQL/Supabase, Docker and their real-service verification were unavailable. The release uses native SQLite/D1, with the differences explicit in DECISIONS.md. This managed run has no supported control-browser skill. The Sites workflow requires skipping browser QA in that case and prohibits starting an alternate preview server or browser-control path. A prior run also encountered missing preview infrastructure. No browser result or screenshot is claimed.

Dense 250-item native D1 HTTP results: cold 743.13 ms, warm median 542.25 ms, slowest 743.13 ms over seven runs. Main 36-item match request: 19.09 ms. This meets the development target in the measured container; production load, cache behavior and transaction latency distributions require further measurement.


## Trade/lending release verification (2026-10-10)

That revision recorded 62 unit/real-SQLite tests. Loan integration tests add real migration/hold projections, closure rollback, compare-and-swap competition with trades, stale decisions, immutable custody/evidence, role-derived assessments, observation limits, blind publication, exclusion privacy, scoring thresholds, and venue calendar maintenance. The 17 compiled Worker/D1 checks additionally execute authenticated loan and feedback flows with real database time. They do not fast-forward the deployed Worker or claim a complete browser receipt journey.

The approved managed browser preview remains unavailable. Browser visual/accessibility QA and independent-browser full pickup/return completion remain unverified. Existing deployed records are preserved; automated tests use isolated databases.

## Navigation/private-photo release verification

| Check | Result for the 2026-10-10 release |
|---|---|
| Strict TypeScript and ESLint | Passed |
| Unit and actual SQLite suite | 83 passed: 21 unit tests and 62 SQL integration tests |
| Production Worker/client build | Passed |
| Compiled Worker/native D1 and R2 | 23 check groups passed |
| Fresh migration integrity | All eight migrations applied to isolated native D1 databases; `quick_check=ok` |
| Mouse, visual, accessibility, and full browser receipt journeys | Unverified; supported browser skill unavailable |

The routing defect was traced to the bundled Vinext Link shim: it prevents native clicks and calls a `navigateClientSide` named export absent from its target chunk. Product links now render native anchors, while action redirects use validated same-origin browser navigation. SSR anchor tests and actual compiled document/RSC/JavaScript/CSS requests passed; these are not mouse-click tests.

SQL resource tests cover concurrent upload retries and ambiguous writes, cleanup during upload, late object writes, failed object deletion, interrupted finalization repaired by tombstone re-sweeps, more than 100 retained references, foreign attachment, and streamed byte overflow. The compiled Worker also validates and serves a detailed 900×900 JPEG, private drafts, historic participant access, moderator boundaries, inactive authentication, schema health, and expired-session cleanup. JPEG preparation and re-encoding have bounded quality fallbacks to preserve the byte limit.

One compiled development run measured 25.85 ms for the 36-item match; dense 250-item D1 HTTP timings were 959.00 ms cold, 768.44 ms warm median, and 959.00 ms slowest over seven runs. The full-size upload took 727.52 ms. These are container wall-time measurements, not a deployed Worker CPU-budget or production-load certification.

The operator-only `pnpm test:navigation` script exercises mouse/sidebar/listing navigation, bell and mode URL reloads, search, cards, history/back, keyboard behavior, and browser errors without starting a server. It remains unrun until an explicitly permitted browser environment is available. Source inspection and HTTP tests do not establish deployed browser or accessibility QA.

## Retry/search release verification (2026-10-11)

The suite now contains 92 tests: 30 unit tests and 62 actual SQLite integration tests. The 24 compiled Worker/native D1/R2 check groups include a client-to-server recovery fault: a real listing mutation commits, its response is replaced with unreadable HTML, and the retry uses the same key to return the original listing without creating a second one. Client tests also cover malformed successful envelopes, incorrect acknowledgment IDs, network/timeout/upstream failures, shared concurrent sends, canonical payload signatures, member scoping, and confirmed-rejection cleanup. Search destination tests preserve browse filters and discard unrelated page parameters.

Strict types, lint, and production build passed. Browser mouse/visual/accessibility QA remains unverified; the supported browser skill is unavailable. The operator browser test now asserts search preserves lending mode, but has not been executed here. These changes preserve the eight-migration chain and existing private community records.

## Action needed dashboard release verification (2026-10-11)

The suite contains 113 tests: 46 unit and 67 actual SQLite integration tests. Strict types, lint, and production build pass. The 25 compiled Worker/D1/R2 groups include own eligible feedback deadlines, observer/moderator exclusion, reminder removal after real submissions, and document/RSC serving for `/activity`. Existing deployments retain the same eight-migration database chain. Saved Sites version metadata identifies the exact pushed source and deployment.

Recorded dashboard checks cover the following behavior:

- Tasks are derived only from the signed-in member's private bootstrap, with roles and current agreement state selecting trade votes/receipts and loan approval, pickup, return, inspection, extension, or review steps.
- Server time controls upcoming/open/deadline distinctions. Feedback uses a server-supplied deadline from authoritative closure, remains limited to eligible direct participants, and disappears when submitted or expired; missing closure data must not create a guessed deadline.
- Draft/paused-item and own meetup-readiness guidance link to existing forms. `/settings?tab=meetups` is implemented as a controlled URL tab reached through native links; its browser activation remains unverified.
- The pure task derivation preserves its snapshot and emits only links; it does not submit consent, record receipts, change a listing, or affect reliability. Existing version, role, deadline, and authorization checks still gate actual writes.

Deployed browser navigation, responsive rendering, keyboard/screen-reader behavior, live-state refresh, and complete physical-receipt journeys remain unverified until exercised in an explicitly permitted browser environment. Availability self-attestations, calendar exports, and saved searches remain unimplemented and have no release-verification claim. This dashboard does not close the external pilot gates.

## GitHub source handoff verification (2026-10-12)

The independent source snapshot passed strict types, lint, a production build, 113 unit/SQLite tests, and 25 compiled Worker/D1/R2 groups. All eight migrations applied to a new isolated local D1 database. All 203 selected source/asset/document files are included with their Git executable modes; credentials, runtime databases/uploads, dependency folders, generated caches/builds, and earlier development Git history are excluded. Documentation links and final newlines were checked. Dependencies were reused for these source checks; an independent fresh install and browser setup remain unverified.

The existing owner-private hosting deployment was confirmed succeeded/active and its application source remains unchanged by the import. The GitHub repository stores source, not a replacement runtime or a connected deployment pipeline. Browser mouse, keyboard, accessibility, private-cache, and independent-browser receipt journeys remain unverified because the supported browser workflow is unavailable. HTTP/runtime checks do not certify those browser behaviors.

## Clean GitHub verification (2026-10-13)

[Verify LoopSwap run 38454434067](https://github.com/Bigchaka02/LoopSwap/actions/runs/38454434067) completed successfully for commit ca22b98493e681a3064b41d8ccd42240dfe58358. Every step passed: checkout, pinned Node and pnpm setup, fresh frozen dependency installation, lint/types/113 tests/build/25 compiled Worker groups, all local migrations, database integrity, and unchanged dependency inputs. This run used a fresh Ubuntu 24.04 runner with read-only repository permissions and no production credentials or storage. It verifies fresh installation and non-browser execution independently of the prior reused dependency tree. Browser navigation/accessibility, the README interactive start/seed walkthrough, and automatic production deployment remain unverified/unconfigured.
