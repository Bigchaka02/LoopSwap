# LoopSwap TODO notes

This is the working checklist for the current synthetic demo and its public source import. Implementation progress and dated evidence are in [Project progress](PROJECT_PROGRESS.md); setup is in [README](README.md).

Source destination: [Bigchaka02/LoopSwap](https://github.com/Bigchaka02/LoopSwap). Existing [website](https://loopswap-campus.bigchaka02.chatgpt.site) hosting remains owner-private. Public source does not imply public app access or pilot readiness.

## Priority 0 — Complete and verify the source import

- [x] Complete the source-only review before publication: exclude runtime secrets, local databases, caches/build output, and private records; keep synthetic fixtures and reproducible source/toolchain files.
- [x] Recheck the source snapshot: 113 unit/SQLite tests, 25 compiled Worker/D1/R2 groups, strict types, lint, and build pass; eight migrations apply to isolated local D1. See [Testing](docs/TESTING.md).
- [x] Preserve the repository owner's initial commit and import the complete source snapshot without earlier development Git history. The import commit identifies this handoff; website access remains owner-private.
- [x] Verify a fresh frozen install, full checks/build, eight local migrations, and database integrity on a clean Linux GitHub runner. [Successful run](https://github.com/Bigchaka02/LoopSwap/actions/runs/38454434067).
- [ ] Exercise the README local browser/start/seed walkthrough from a fresh clone and validate alternate source-to-hosting configuration boundaries.
- [x] Preserve third-party notices, including the [shadcn stylesheet license](vendor/shadcn-tailwind-4.13.0.LICENSE.md) and [Sites Vite plugin license](build/sites-vite-plugin.LICENSE). A project redistribution license has not been assigned; that remains an open owner decision.

## Priority 1 — Validate the actual user journeys

- [x] Configure automated GitHub verification on pushes and pull requests, using pinned actions, a fresh frozen install, and isolated database checks. The first clean run passed; evidence is in [Project progress](PROJECT_PROGRESS.md).
- [ ] Configure source-to-hosting deployment with approved credentials and release checks. Verification CI does not deploy the site.

These remain unchecked until exercised in an explicitly permitted browser environment.

- [ ] Run `pnpm test:navigation` against an authorized isolated preview: sidebar, List an item, notification bell, modes, filter-preserving search, cards, history/back, and keyboard navigation.
- [ ] Run `pnpm test:e2e` with independent member cookie contexts and complete the real receipt-time gate; do not substitute HTTP results for browser completion.
- [ ] Exercise lending approval, pickup, return claim, lender acknowledgment, inspection, extension, review, and republishing end to end.
- [ ] Verify `/activity` roles, updated deadlines and waiting states, completed-feedback removal, empty states, and `/settings?tab=meetups` activation in the browser.
- [ ] Check narrow/mobile layouts, zoom, focus order/restoration, dialogs/selects, errors/live regions, and screen-reader reading of the full directed ledger.
- [ ] Check browser photo preparation, private draft/history access, inactive/outsider denial, cache behavior, and interrupted-upload recovery.
- [ ] Validate WebMCP registration and authorized read/action/error behavior in a supported context.

See the [acceptance mapping and browser gate](docs/TESTING.md) for evidence requirements.

## Priority 2 — Establish pilot operations before real-member use

- [ ] Provision a separate real community and audit trusted platform identity mappings, membership approval, suspension/departure, and moderator authority.
- [ ] Name moderation and venue-calendar owners, response targets, escalation contacts, and evidence/appeal procedures.
- [ ] Configure a monitored minute scheduler with the server-only reconciliation secret; test authentication failure, retries, overdue cases, expired sessions, and photo cleanup.
- [ ] Configure encrypted backup/export access and rehearse restoration into an isolated database; verify the aggregate, both item-hold projections, participant holds, events/outbox, and identities.
- [ ] Decide and implement history/report/photo/log retention, archival, and erasure policy while protecting active/review custody and historical evidence.
- [ ] Establish capacity and failure alerts, then measure deployed CPU, latency, contention, storage growth, and recovery behavior at the intended community size.
- [ ] Complete the browser/accessibility gates above and record an explicit pilot decision with accountable owners.

The [operator runbook](docs/OPERATIONS.md) and [privacy boundaries](docs/SECURITY_PRIVACY.md) describe what exists and what is still external setup.

## Honest assessment

| Strength | Evidence or practical value |
|---|---|
| Agreement integrity is central | Immutable directed plans, database-clock checks, atomic projections, competing-commit tests, and retained uncertain holds protect consent and inventory |
| Physical receipt has a clear author | Trade recipients, loan borrowers at pickup, and lenders at return report only their own receipt; moderators record outcomes instead of manufacturing evidence |
| Private data stays scoped | Authorized DTOs and private photo reads separate member schedules, reports, and agreement history from catalogue discovery |
| Retries and partial failures are considered | Exact request acknowledgment, idempotent writes, fault tests, upload claims, and permanent tombstones support recovery |
| Reputation avoids invented certainty | Roles and observed dimensions stay separate; unknown answers, blind publication, minimum history, and disputes constrain score interpretation |
| Operational limits are visible | Readiness controls and admission/recovery budgets expose capacity and configuration without claiming verified service readiness |

| Weakness or limit | Consequence and next step |
|---|---|
| Browser evidence is missing | Source/HTTP tests cannot certify clicks, accessibility, browser caching, or complete physical-receipt journeys; execute the supplied browser workflow |
| Storage is one bounded community aggregate | Whole-state writes and retained history constrain growth and contention; implement safe archival, measure load, and plan normalized storage if needed |
| Pilot identity depends on the trusted hosting boundary | A standalone deployment must not trust caller-supplied identity headers; audit provisioning and document any alternate deployment contract |
| External operations are incomplete | A job endpoint and readiness panel do not run a scheduler, restore backups, staff moderation, or implement retention |
| Client recovery is page-memory based | Uncertain request keys are not a durable reload ledger; assess reload/offline recovery without weakening server idempotency or privacy |
| Discovery depends on current offers and shared hours | An empty calendar or insufficient inventory prevents useful matches; improve onboarding and explain blockers without inventing availability or consent |
| Feedback remains participant testimony | Participation and eligibility are enforced, but claims are not independent physical verification; keep dispute procedures and score labels clear |
| Product success is not measured | No production analytics or environmental-savings evidence exists; define privacy-conscious measures before making success claims |

## Design and architecture notes

- Keep the full giver/item/recipient ledger and each member's incoming/outgoing item visible. Two- and three-person trades require fixed terms and independent votes.
- A physical item offered for both modes has one reservation boundary. Lending never changes ownership; returns and inspected closure are separate actions.
- Background refresh must not silently replace terms being reviewed. Material changes need fresh review, and changed appointments clear checked consent.
- Native anchors and same-origin action navigation are intentional compatibility choices. Keep URL-backed filters and meetup-tab links reloadable.
- `/activity` derives private guidance from server state and time. It opens existing forms and never performs automatic consent, receipts, listing changes, or reliability penalties.
- Server authorization precedes cached replay. D1 triggers protect integrity; they do not provide per-user RLS. Append migrations and preserve an uncertain deployed migration boundary.
- Photos use separate D1 claims and private object writes, not one cross-service transaction. Preserve owner/reference guards, bounded decoding, tombstones, and idempotent cleanup.
- In-app notification records are transactional. Email/push delivery, realtime subscriptions, production analytics, and archival are not connected services.

See [Architecture](docs/ARCHITECTURE.md), [Transactions](docs/TRANSACTIONS.md), [Data model](docs/DATA_MODEL.md), [API](docs/API.md), and [Decisions](docs/DECISIONS.md).

## Future ideas — unimplemented

| Idea | Design boundary to preserve |
|---|---|
| Availability self-attestations | Present current readiness separately from peer-assessed availability and condition scores; never turn self-report into score evidence or consent |
| Calendar exports | Export agreed appointments privately; explain updates/cancellations and do not change terms or author receipts |
| Saved searches | Save existing filters first; subscription consent and notification delivery need separate design |
| Reciprocal temporary swaps | Treat two custody/return obligations explicitly; do not reuse permanent-trade completion as a loan return |
| Privacy-conscious product measures | Measure matching liquidity and completion/review outcomes without fabricating savings or collecting unnecessary schedules/report evidence |

These are candidates for a later roadmap, not present capabilities. Current scope is in [Product](docs/PRODUCT.md).

## Open owner questions

1. What redistribution license should apply to the project source, alongside the retained third-party licenses?
2. Which campus/community and initial population would a pilot serve, and who owns membership approval and real identity provisioning?
3. Who will maintain venue hours, handle custody/feedback reviews, and own escalation and appeals?
4. What enforced retention and erasure rules should cover agreements, reports, photos, tombstones, and provider logs?
5. What service capacity, recovery target, and operating budget should the architecture support before normalization or backend migration becomes necessary?
6. When will a permitted browser/accessibility validation environment be available, and who records the final pilot decision after its gates pass?
