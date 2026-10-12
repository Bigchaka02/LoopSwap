# LoopSwap

**A little loop. A lot of possibility.**

LoopSwap is a campus exchange app for trading things you own or lending something useful for a while. It discovers direct swaps and three-person trading loops, records each person's agreement, and keeps temporary loans tied to a clear return plan.

[Open the website](https://loopswap-campus.bigchaka02.chatgpt.site) · [Project progress](PROJECT_PROGRESS.md) · [To-do, notes & open questions](TODO_NOTES.md)

Maintained by [Bigchaka02](https://github.com/Bigchaka02). Current release: an owner-private, persistent **synthetic demo**, with fictional members and example items. Website access follows the existing hosting permissions; viewing this public repository does not grant access to the private demo. Real campus onboarding and operating procedures remain release work.

## What the project demonstrates

Ordinary barter requires two people to want each other's items. LoopSwap can discover a larger circle: Alice wants Bob's calculator, Bob wants Carol's textbook, and Carol wants Alice's lock. Each person gives one item and gets one they want, subject to a complete shared agreement.

| Trade to keep | Borrow & return |
| --- | --- |
| Ownership changes through a two- or three-person exchange. | Ownership stays with the lender. |
| Everyone approves one fixed transfer plan and public meetup. | The lender approves an exact item, terms, pickup, and return appointment. |
| Each recipient records receiving their own item. | The borrower records pickup; the lender separately records receiving the item back. |
| Completion follows all required receipts and no open problem. | Inspection and closure pause the listing until its owner checks and republishes it. |

A listing can support trading, lending, or both. One shared item hold prevents the same item from being committed to two agreements at once. Digital approval is not proof of physical handoff.

### Example items

| Alice's lock | Bob's calculator | Carol's textbook |
| --- | --- | --- |
| <img src="public/images/bike-lock.webp" width="180" alt="Illustrative bicycle lock" /> | <img src="public/images/calculator.webp" width="180" alt="Illustrative scientific calculator" /> | <img src="public/images/textbook.webp" width="180" alt="Illustrative economics textbook" /> |

These are synthetic illustrations. They do not represent real campus transactions.

## A quick user guide

1. Open **Browse**, then **Sign in** and choose a fictional demo member. Use separate browser profiles for independent participants; private windows may share cookies.
2. Review **Account → Meetup preferences**. Choose an active approved public venue and add future availability.
3. Use **List an item** to describe its condition honestly, choose Trade/Lend/Both, and publish. Trading offers need acceptable wants; lending offers need a maximum duration and care instructions. Photos are optional.
4. For trading, open **Find my trades** and review the full transfer plan. Every participant decides independently. For borrowing, open a lending listing and agree to exact pickup and return appointments before submitting a request.
5. Use **Action needed** to track approvals, upcoming meetups, receipts, return plans, feedback, and item reviews. Actions open the original agreement or listing form.
6. At the agreed appointment, inspect the item and acknowledge only your own actual receipt. Report a problem when custody or condition is uncertain. A borrower return report remains separate from the lender's receipt.
7. After closure, submit participant feedback within seven days. New members start without an invented reliability score.

The demo starts with 16 fictional members and 36 example listings. Jamie Harper is the fictional moderator. If approved venue hours have expired in the persisted demo, Jamie can publish new hours under **Moderation → Venue hours**; members separately update their own availability. Expired calendars are not silently renewed.

## Features

- Directed two- and three-person trade discovery using category/catalog wants, disclosed condition, priorities, and shared public meetup options.
- Permanent trading and temporary lending, with common reservation guards and immutable agreed-item snapshots.
- Independent approvals, pickup/return acknowledgments, accepted extensions, inspection, cancellation, and custody review.
- Separate **trader, lender, and borrower** reliability histories. Blind feedback, observation limits, dispute handling, and minimum evidence thresholds keep scores interpretable.
- Search and URL-backed filters, item editing, member histories, account preferences, in-app notifications, and an Action needed dashboard.
- One optional private item photo, browser preparation, independent server pixel validation, owner-authorized attachment, and protected historical references.
- Moderator evidence tools, approved venue calendars, and service-readiness reporting.
- Durable D1 persistence, retry deduplication, atomic reservations, audit events, and transactional in-app notifications.

There is no cash, shipping, deposit system, bargaining chat, automated valuation, or automated ownership verification. Reported experience is evidence from participants, not independent proof of honesty or custody. See [Product](docs/PRODUCT.md) and [Loans and reliability](docs/LOANS_REPUTATION.md).

## Full stack

| Area | Implementation |
| --- | --- |
| Frontend | React 19, strict TypeScript, Next-style pages implemented by Vinext, Vite builds |
| Styling | Tailwind CSS, custom CSS, shadcn-style UI primitives, Lucide icons, Sonner notifications |
| Browser behavior | React hooks/context, native page links, URL filters, Fetch JSON requests, five-second signed-in refresh |
| Backend | TypeScript API routes on Cloudflare Workers; Zod validation and server-resolved identity/permissions |
| Domain logic | Matching, scheduling, trade/loan state transitions, feedback scoring, and activity derivation in `domain/` |
| Data | Cloudflare D1 SQLite; revisioned community state, SQL integrity projections/triggers, eight append-only migrations |
| Photos | Private Cloudflare R2 storage and D1 upload records; bounded JPEG validation/re-encoding |
| Auth | Hashed cookie sessions for the fictional demo; hosting identity mapped to approved memberships for a future pilot |
| Checks | TypeScript, ESLint, Vitest, real SQLite integration checks, compiled Worker/D1/R2 tests; operator browser scripts |

Exact versions are recorded in [package.json](package.json), [toolchain.json](toolchain.json), and [pnpm-lock.yaml](pnpm-lock.yaml). Node **24.19.0** and pnpm **11.25.0** are the recorded toolchain.

## Run locally

Clone the repository and install its locked dependencies:

```sh
git clone https://github.com/Bigchaka02/LoopSwap.git
cd LoopSwap
pnpm install --frozen-lockfile --ignore-workspace
cp .dev.vars.example .dev.vars
pnpm build
pnpm db:migrate
pnpm db:check
pnpm start
```

On Windows, copy `.dev.vars.example` to `.dev.vars` using your shell or file manager. Follow the local URL printed by the server, normally `http://127.0.0.1:8787`.

Choose a fictional member on **Sign in** to initialize an empty local demo. Alternatively, while the server is running, use a second terminal:

```sh
pnpm db:seed
```

Initialization is guarded and preserves existing data; it is not a reset command. `LOOPSWAP_MODE=demo` explicitly permits fictional accounts. A missing or different mode selects pilot behavior and disables demo sign-in. Never connect a real member database to demo mode.

For editing source, `pnpm dev` starts the development configuration. Local state, environment values, dependencies, and generated build output are ignored by Git. The public source includes only secret-free environment examples; create real deployment secrets in the hosting environment.

## Verify the project

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:worker
```

`pnpm verify` runs that sequence. Tests use isolated databases and synthetic sessions. The latest recorded application release passed **113 unit/SQLite tests** and **25 compiled Worker/D1/R2 check groups**. Current handoff checks are recorded in [Project progress](PROJECT_PROGRESS.md).

Browser navigation, responsive visuals, keyboard/screen-reader behavior, and complete independent-browser receipt journeys require a permitted browser environment. Browser scripts are supplied but those checks remain unverified here. See [Testing](docs/TESTING.md).

## Hosting and deployment

The existing full-stack demo runs at [loopswap-campus.bigchaka02.chatgpt.site](https://loopswap-campus.bigchaka02.chatgpt.site), behind its current owner-private access policy. GitHub stores the source; pushing this repository does not provision a replacement database, object store, authentication service, or automatic deployment.

This application needs a Worker runtime, D1 binding named `DB`, and an R2 binding named `BUCKET` for private photo uploads. GitHub Pages alone cannot run these backend services. The existing hosting manifest and build integration are preserved so the current deployment remains compatible.

A separate deployment needs its own storage resources, migrations, runtime mode, secrets, and an audited identity boundary. Pilot authentication currently depends on trusted hosting identity headers and approved membership mappings; exposing that boundary directly without a replacement authentication design is not a supported pilot configuration. Follow [Operations](docs/OPERATIONS.md) and [Security/privacy](docs/SECURITY_PRIVACY.md).

The source snapshot contains application code, assets, migrations, lockfile, tooling, and documentation. Existing private database contents, uploaded photos, sessions, credentials, and prior development Git history are not part of the repository.

## Project documents

| Document | Purpose |
| --- | --- |
| [Project progress](PROJECT_PROGRESS.md) | Goals, development steps, completed milestones, and current verification |
| [To-do and notes](TODO_NOTES.md) | Priorities, self-analysis, future ideas, and open project questions |
| [Architecture](docs/ARCHITECTURE.md) | Runtime boundaries, source map, persistence, and deployment assumptions |
| [API](docs/API.md) | Routes, mutation contracts, errors, and retry behavior |
| [Loans and reliability](docs/LOANS_REPUTATION.md) | Custody workflow, scoring, feedback, and disputes |
| [Transactions](docs/TRANSACTIONS.md) | Consent, atomic holds, reconciliation, and recovery |
| [Testing](docs/TESTING.md) | Recorded evidence and remaining browser/pilot verification |
| [Operations](docs/OPERATIONS.md) | Local setup, calendars, jobs, storage cleanup, backups, and release gates |

## License

No project-wide redistribution license has been assigned. Dependency and vendored-source licenses remain applicable, including those in `build/` and `vendor/`. Public repository visibility does not itself grant a project license.
