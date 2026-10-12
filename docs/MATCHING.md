# Matching

## Direction and wants

An edge **A → B** means B accepts A's offered item under one of B's offered listing's structured wants. Every edge must satisfy an active distinct owner, eligible item, category or exact catalog match, and minimum condition. Condition values are fair=1, good=2, excellent=3. Wants are OR alternatives with priority 1–3.

For explanations, choose the satisfied rule with highest priority, then exact catalog specificity, then lexicographically smallest rule ID. A higher category-rule priority can beat an exact catalog rule. There is no similarity score, inferred want, or valuation.

The seeded main graph is Alice gives a lock to Carol; Carol gives a textbook to Bob; Bob gives a calculator to Alice. The transfer ledger includes each listing, giver, recipient, selected rule/version, priority, explanation, and immutable item snapshot.

## Eligibility and scheduling

Exclude non-active listings, inactive memberships, item holds, participant holds, and any pair blocked in either direction. Reject repeated listing IDs and repeated owners. A held participant cannot use another item to join another confirmed/review loop.

Intersect all participants' accepted venue IDs with active approved venues. Merge overlapping **and adjacent** UTC availability windows before intersecting all participants and venue hours. Use a common 30-minute slot on 15-minute boundaries. The complete slot must fit; a 29:59 venue opening is insufficient. New proposals need at least two hours of lead time.

Pairwise compatibility is insufficient: A/B, B/C and C/A can each overlap at different times or venues while the group has no common option. Return a safe generic reason (`no_common_time`, `no_common_venue`, `no_compatible_items`, `offer_unavailable`) without identifying blocked/hidden members or disclosing full schedules.

## Cycles, ranking and bounds

Build directed adjacency for up to 250 eligible listings and up to three selected owned offers. Enumerate reciprocal two-cycles and directed three-cycles. Rotate a cycle so its lexicographically smallest listing starts the key; do not collapse a meaningful reverse three-cycle. Key terms are ordered `listingId@materialVersion`, excluding meetup location/time, so the same active item cycle cannot accumulate duplicate proposals at different times.

Candidates rank by requester incoming priority (descending), minimum group priority (descending), earliest common slot, participant count, then canonical key. Return at most 20 candidates, each with at most three options. An exhausted traversal budget (100,000 evaluations) or community-size bound is explicitly signalled as `truncated`. Eligibility lookups and shared options are reused within one snapshot; no persistent matching cache can bypass current versions.

## Revalidation and evidence

Proposal creation recomputes the graph and checks every supplied snapshot version and exact slot. Final acceptance checks current membership, item/want/preference/policy versions, blocks, all holds, chosen rule and slot. Listing or preference changes make pending consent stale. Confirmed terms never silently substitute an item, recipient, venue or time.

Tests cover the main full ledger, direct/repeated-owner/repeated-item cases, rotations/reversals, rule selection, conditions, blocks, intersections, DST rejection, exact lead and end boundaries, ordering, and truncation. Sixty deterministic randomized small graphs are compared with an independent exhaustive enumerator, including complete transfer ownership/rule/item snapshots.

The dense 250-listing, 99-member benchmark has three category wants per added listing and up to three items/member. Recorded native D1/compiled Worker HTTP timings: 743.13 ms cold, 542.25 ms warm median, 743.13 ms slowest across seven runs. Pure matcher timings: 737.33 ms cold, 623.67 ms warm median, 752.89 ms slowest. Node 24.19.0; CPU model/count were not exposed by the sandbox; reported host memory was 9.7 GiB. Rerun `pnpm benchmark` and `pnpm test:worker` for current measurements. These figures do not establish production latency under load.
