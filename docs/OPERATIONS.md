# Operations

## Local setup

Use Node 24.19.0 and pnpm 11.25.0 with the committed lockfile. Follow README setup: install, copy `.dev.vars.example`, build, `db:migrate`, `db:check`, start, then optional `db:seed`. The migration/check scripts always pass `--local` and use the built DB binding and `.wrangler/state`. Apply every checked-in migration, including loan holds and private photo records. Record this revision's migration and database checks in [testing](TESTING.md); earlier fresh-database checks do not certify an upgraded deployment.

`db:seed` accepts only a loopback origin, calls the guarded demo initializer, and never resets existing data. Initialization also occurs when a fictional member explicitly enters the demo. Startup and unauthenticated GETs do not seed. Tests use separate ephemeral SQLite/Miniflare databases; they do not touch the app's records.

## Hosted demo

The Site is owner-private. Source, migrations and compiled assets are versioned together; runtime values live in hosting configuration. `LOOPSWAP_MODE=demo` selects the isolated synthetic release. The optional photo editor requires the private R2 `BUCKET` binding; confirm its availability in the deployed readiness response rather than assuming a source change configured storage. Site publication applies recorded migrations before Worker upload, so a failed deployment can leave schema changes applied. Inspect the migration boundary before any forward repair.

Do not change the audience without authorization. Do not populate the demo with real member data. Pilot mode requires a separate real community database and audited operator provisioning of members and `platform_identities`. The current protection disallows routine membership additions through ordinary aggregate mutations; a narrow privileged provisioning/approval path is release work, not a hidden public bypass.

## Reconciliation job

The endpoint is `POST /api/jobs/reconcile` with `Authorization: Bearer <server-secret>`. Configure a random `LOOPSWAP_JOB_SECRET` as a secret runtime variable, then redeploy the saved source version so the revision applies. An external scheduler should invoke it every minute, retry transient failures with the same task purpose, and monitor failures. Never put the secret in a browser bundle, public URL, chat prompt, or source file.

**An actual external scheduler and its runtime secret remain pilot setup requirements; this release does not claim they are connected.** The endpoint fails closed while the secret is unset. The maintenance panel reports only whether authentication is configured, not that a scheduler is calling it. Authenticated reads and writes perform the same idempotent deadline reconciliation, and late consent always checks database time; scheduler delay cannot allow late confirmation. An idle overdue exchange may not be marked review until the next request without the scheduler.

Reconciliation expires pending proposals at their deadline and sends confirmed loops with missing receipts to review at meetup end+2h. It retains all uncertain holds. Repeated runs do not duplicate events/notifications. There is no external email/push delivery; the outbox's delivered state means the transactional in-app notification record exists.

The job also removes expired demo sessions and processes unused photos. Photo cleanup is bounded to 100 records per invocation. An unreferenced upload becomes eligible after 24 hours; all current listing and historical trade/loan references stay protected. Deletion work moves through durable tombstones, failed deletes remain retryable, and old deleted tombstones are re-swept to remove late objects from interrupted uploads. Cleanup counts records processed and can repeat safe object deletes; it is not necessarily a count of distinct objects removed. Tombstones are retained permanently by this workflow.

Moderators can run the same photo cleanup under **Moderation → Service readiness**. The aged-upload count is an estimate; reference guards determine whether a record can actually be cleaned. This control does not replace a monitored minute scheduler or implement history archival.

## Moderator runbook

1. Read the private report, full transfer history, real receipts and current review sequence.
2. Obtain evidence for each item's actual location; do not infer handoff from digital acceptance.
3. Record recipient/original_owner/unresolved for every item and a reason. Unknown outcomes retain all holds.
4. Known recipient items become exchanged; returned items become paused. Owners can explicitly republish returned items.
5. Review listing removal or membership suspension with an explicit target and reason. These actions must preserve uncertain active handoff holds.

A named accountable moderation team, response targets and escalation process are required for a real pilot; none is asserted for the fictional demo.

Moderation also contains **Venue hours**. Publish or remove approved future opening windows within 30 days. Members choose their own availability under Account. Removing hours can invalidate pending agreements or send outstanding appointments to review; accepted historical terms and receipts are preserved. The operator UI exists, but recurring calendar maintenance and staffing still need an operational owner.

## Backup, restore, capacity and alerts

Before pilot launch, configure the managed D1 provider's backup/export and recovery access, encrypt exports, define retention, and rehearse a restore into an isolated database. Verify aggregate revision/ledger, both hold projections, events/outbox and identities after restoration. Access to a real provider backup/restore workflow was unavailable, so no restore success is claimed.

Ordinary mutations stop at 600,000 UTF-8 state bytes; receipt/cancellation/problem/moderator resolution use recovery capacity to 1,400,000 bytes; D1 rejects 1,500,000 bytes. Archive history well before the ordinary budget is reached. Archive code and automated retention are not implemented; do not delete active/review loops or their item/member holds as a capacity workaround.

Monitor retryable database errors, job failures, unresolved reviews, aggregate size, trade/loan holds, photo cleanup work, and unexpected outbox growth. Alert transport and production dashboards are not configured. `/api/health` now queries D1 for the required schema tables and reports whether the photo binding exists; it does not certify data integrity, object availability, a working scheduler, or pilot readiness. Use database integrity and restore checks as well.

The moderator service-readiness panel reports community bytes and admission/recovery budgets, trade and loan item holds, custody reviews, private photo binding availability, and job-secret presence. It warns as new-activity capacity approaches its limit. Identity provisioning, approved membership, accountable moderators, an actual monitored scheduler and secret, backup/restore rehearsal, archival/retention, and deployed browser/accessibility QA remain separate pilot gates.

Rotate job secrets through hosting configuration plus deployment, and revoke stored demo tokens or platform mappings through privileged operations when needed. Preserve source/migration versions during incidents. Never retry the same deterministic failed migration archive unchanged or assume arbitrary down migrations are safe.


## Trade and lending release

The app now supports trade/lend/both listing modes, one-item loans with independent pickup and return acknowledgments, shared trade/loan reservations, moderator custody cases, and role-specific participant assessments. See [Loans and reliability](LOANS_REPUTATION.md) for the state machine, data and transaction rules, scoring weights, privacy, operator calendar workflow, and remaining pilot gates. The older trade-only descriptions above apply to the existing loop subsystem.
