# Demo

## Dataset and accounts

There are 16 fictional members and 36 initial listings. No loop, receipt, report or completion history is fabricated. Illustrative generated photos show the lock, calculator and textbook; the other entries work without photos.

| Selectable account | Member UUID suffix | Main role |
|---|---|---|
| Alice Martin | 000000000001 | Gives lock to Carol; receives calculator from Bob |
| Bob Chen | 000000000002 | Gives calculator to Alice; receives textbook from Carol |
| Carol Davis | 000000000003 | Gives textbook to Bob; receives lock from Alice |
| Maya Patel | 000000000004 | Offers chess set; wants sketchbook |
| Ethan Brooks | 000000000005 | Offers sketchbook; wants chess set |
| Jamie Harper | 000000000016 | Fictional moderator |

UUID prefix is `00000000-0000-4000-8000-`. Main listing suffixes are 101 (lock), 102 (calculator), 103 (economics textbook); direct-swap listings are 104 and 105. Each uses an actual structured exact-catalog want. No passwords exist or are published.

## Preparation and timing

Use the isolated demo with `LOOPSWAP_MODE=demo`. Choosing a fictional member initializes the empty community once. It never resets existing records. Local `pnpm db:seed` performs the same insert-if-empty operation and is restricted to a loopback app origin.

Fixture availability begins at the next 15-minute boundary at least 24 hours after first initialization, with six daily four-hour windows. Library entrance and student-union courtyard share those fixture openings. Every new proposal requires two hours of lead, a 30-minute full slot and a response deadline before the meetup. Receipts open ten minutes before the agreed meetup; they cannot be accelerated from a browser.

The seed's dated availability/venue openings are finite. After those fixture dates pass, Jamie can publish approved future opening windows under **Moderation → Venue hours**, within the next 30 days. Participating members must independently save future availability under **Account → Meetup preferences**. Changing one member's preferences cannot extend expired venue hours. This operator UI exists; unattended recurring calendar maintenance still needs an operational owner. Upgrades do not silently reset the community or advance consent.

## Three-session walkthrough

1. Use different browser profiles or different browsers for Alice, Bob and Carol. Private windows in one browser may share cookies; tabs always share a profile session.
2. As Alice, open Matches. The main result shows Alice → Carol → Bob → Alice. Read the complete give/receive ledger and selected public meetup.
3. Review & propose, choose an exact shared option, check acceptance, and create the proposal. Alice's acceptance is recorded; nothing is held yet.
4. As Bob, open Trades and independently accept the identical terms. Still no holds.
5. As Carol, open the same loop and accept. Only this final valid consent commits all item/member reservations. Each profile can refresh to see the authoritative confirmed state.
6. At receipt opening, each recipient confirms only their own item: Alice receives calculator, Bob textbook, Carol lock. All receipts with no open report complete the loop and move the items into exchanged history.

The optional Playwright script uses separate browser contexts and the same visible controls. It reports PARTIAL before the real receipt gate; it does not label an immediate confirmation walkthrough a completed physical-transfer journey.

## Failure demonstrations

- Edit an offered item before confirmation: the old pending proposal becomes stale.
- Propose two cycles competing for Bob/Carol: concurrent final acceptance confirms at most one complete loop; the other becomes conflicted.
- Before a handoff, cancel with no receipt/problem: all holds release together.
- Report a handoff problem or cancel after receipt/start: review retains all holds.
- As Jamie, record unresolved outcomes: holds stay. Record verified original-owner outcomes: review resolves, returned items pause, no recipient receipt is invented. The original owner can verify and republish.

Run these on separate fresh test datasets or knowingly against the synthetic demo. The automated suites create their own isolated databases and do not reset this demo.

## Lending and photos

1. As the owner, edit an unheld item to allow Lend or Both. Set its maximum duration and care/return instructions. A photo is optional; the editor accepts JPG, PNG, or WebP up to 8 MB when private storage is available.
2. As another member, use **Borrow & return** in Browse or the link from Lend & borrow. Review the loaned item's frozen description, condition, terms, shared pickup, and proposed approved return window.
3. Changing pickup or return clears acceptance. If the item changes while the dialog is open, review the latest terms before submitting. A borrowing request holds nothing until the lender accepts.
4. The borrower acknowledges actual pickup when reporting opens. A borrower return claim remains separate from the lender's receipt; the lender acknowledges their own return receipt and inspects before closure. Respect the real appointment clock and minimum loan duration; this is not an immediate complete-loan demonstration.
5. Closed or appropriately resolved owner returns pause the listing. The owner reviews its current condition and explicitly republishes; the historical agreement remains fixed. Eligible feedback records actual participant answers without fabricated scores.

Uploaded drafts are private to their uploader and authorized moderators. Published listing readers and historical agreement participants receive authorized photo access. Replacing a current photo does not erase a photo retained in an agreement. Jamie's **Service readiness** panel reports photo availability, capacity, review work, and job-authentication status, and can process unused-upload cleanup. It does not claim that external scheduling, backups, retention, or pilot provisioning are complete.

## Recording labels

No independent-browser recording or product screenshot was produced here. If recording a confirmation-only walkthrough, label it “synthetic demo—confirmation journey; receipt completion not recorded.” A database/HTTP test recording is not a browser demonstration. No simulated clock, prepared screenshot or fixture outcome should be described as a real physical exchange.
