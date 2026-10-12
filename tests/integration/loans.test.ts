import { afterEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, CAROL, MODERATOR, createSeed, fixtureId } from '../../domain/seed';
import { applyOperation } from '../../domain/operations';
import { findMatches, sharedOptions } from '../../domain/matching';
import { currentReturn, type State, type Review } from '../../domain/types';
import { publishedReview, reputationFor } from '../../domain/reputation';
import { bootstrapDto } from '../../server/dto';
import { makeDatabase, FIXED_NOW, proposeMain, confirmMain } from '../helpers';
const open: ReturnType<typeof makeDatabase>[] = [];
afterEach(() => open.splice(0).forEach(d => d.close()));
function setup(initial?: State) { const seed = initial ?? createSeed(FIXED_NOW); seed.listings[0].offerMode = 'both'; seed.listings[0].maxLoanDays = 7; const d = makeDatabase(':memory:', seed); open.push(d); return d; }
function request(d: ReturnType<typeof makeDatabase>, borrower = BOB) {
  const s = d.snapshot(), item = s.state.listings[0], pickup = sharedOptions(s.state, [ALICE, borrower], s.now).options[0];
  const r = d.act(borrower, 'loan.request', { listingId: item.id, expectedVersion: item.version, pickup, returnSlot: { ...pickup, start: pickup.start + 86400, end: pickup.end + 86400 }, accepted: true }) as unknown as { loanId: string };
  return r.loanId;
}
function loan(d: ReturnType<typeof makeDatabase>, id: string) { return d.snapshot().state.loans!.find(l => l.id === id)!; }
function act(d: ReturnType<typeof makeDatabase>, actor: string, op: string, id: string, details = {}) { return d.act(actor, op, { id, expectedSequence: loan(d, id).sequence, ...details }); }
function agreed(d: ReturnType<typeof makeDatabase>) { const id = request(d); act(d, ALICE, 'loan.vote', id, { vote: 'accept' }); return id; }
function returned(d: ReturnType<typeof makeDatabase>) { const id = agreed(d); d.clock.now = loan(d,id).pickup.start; act(d, BOB, 'loan.pickup', id, { note: 'Received and inspected the disclosed scuffs.' }); d.clock.now = currentReturn(loan(d,id)).start; act(d, BOB, 'loan.return.report', id); act(d, ALICE, 'loan.return', id, { note: 'Received back and inspected.' }); return id; }
function closed(d: ReturnType<typeof makeDatabase>) { const id = returned(d); act(d, ALICE, 'loan.close', id); return id; }
const holds = (d: ReturnType<typeof makeDatabase>) => (d.db.prepare('SELECT count(*) AS n FROM loan_item_holds').get() as { n: number }).n;
describe('loan custody and real transaction integrity', () => {
  it('holds nothing on request, holds exactly one on acceptance, and preserves ownership through closure', () => {
    const d = setup(), id = request(d); expect(holds(d)).toBe(0); act(d, ALICE, 'loan.vote', id, { vote: 'accept' }); expect(holds(d)).toBe(1);
    expect(bootstrapDto(d.snapshot().state, BOB, d.clock.now).listings[0].loanHeld).toBe(true);
    d.clock.now = loan(d,id).pickup.start; act(d, BOB, 'loan.pickup', id, { note: '' }); act(d, BOB, 'loan.return.report', id); expect(holds(d)).toBe(1);
    act(d, ALICE, 'loan.return', id, { note: '' }); expect(holds(d)).toBe(1); act(d, ALICE, 'loan.close', id); expect(holds(d)).toBe(0);
    expect(d.snapshot().state.listings[0].ownerId).toBe(ALICE); expect(d.snapshot().state.listings[0].status).toBe('paused'); expect(loan(d,id).pickupReceipt?.recipientId).toBe(BOB);
  });
  it('enforces participant directions, receipt opening, and private reads', () => {
    const d = setup(), id = agreed(d);
    expect(() => act(d, ALICE, 'loan.pickup', id, { note: '' })).toThrow('borrower'); expect(() => act(d, BOB, 'loan.pickup', id, { note: '' })).toThrow('ten minutes');
    expect(() => act(d, BOB, 'loan.return', id, { note: '' })).toThrow('lender'); expect(bootstrapDto(d.snapshot().state,CAROL,d.clock.now).loans).toEqual([]);
    expect(bootstrapDto(d.snapshot().state,CAROL,d.clock.now).events).toEqual([]); expect(() => act(d,CAROL,'loan.cancel',id)).toThrow('unavailable');
  });
  it('two competing loans can reserve the item only once', () => {
    const d=setup(), a=request(d), b=request(d,CAROL); act(d,ALICE,'loan.vote',a,{vote:'accept'}); act(d,ALICE,'loan.vote',b,{vote:'accept'});
    expect(holds(d)).toBe(1); expect(loan(d,b).state).toBe('CONFLICTED');
  });
  it('a loan wins against a pending trade and a confirmed trade makes a new loan unavailable', () => {
    const d=setup(), trade=proposeMain(d); agreed(d);
    expect(findMatches(d.snapshot().state,ALICE,[fixtureId(101)],d.clock.now).candidates).toEqual([]);
    d.act(BOB,'loop.vote',{id:trade,expectedVersion:1,vote:'accept'}); expect(d.act(CAROL,'loop.vote',{id:trade,expectedVersion:1,vote:'accept'}).state).toBe('CONFLICTED'); expect(holds(d)).toBe(1);
    const e=setup(), t=proposeMain(e); e.act(BOB,'loop.vote',{id:t,expectedVersion:1,vote:'accept'});e.act(CAROL,'loop.vote',{id:t,expectedVersion:1,vote:'accept'});
    expect(()=>request(e)).toThrow('unavailable');
  });
  it('an injected loan projection failure rolls back all state, audit and notification writes', () => {
    const d=setup(), id=request(d), before=d.snapshot(); d.db.exec("CREATE TRIGGER fail_loan BEFORE INSERT ON loan_item_holds BEGIN SELECT RAISE(ABORT,'INJECTED_LOAN'); END");
    expect(()=>act(d,ALICE,'loan.vote',id,{vote:'accept'})).toThrow('INJECTED_LOAN'); expect(d.snapshot()).toEqual(before); expect(holds(d)).toBe(0);
  });
  it('return closure failure keeps the receipt and hold for a safe retry', () => {
    const d=setup(), id=returned(d), before=d.snapshot(); d.db.exec("CREATE TRIGGER fail_loan_close BEFORE DELETE ON loan_item_holds BEGIN SELECT RAISE(ABORT,'INJECTED_CLOSE'); END");
    expect(()=>act(d,ALICE,'loan.close',id)).toThrow('INJECTED_CLOSE'); expect(d.snapshot()).toEqual(before); expect(holds(d)).toBe(1);
    d.db.exec('DROP TRIGGER fail_loan_close'); act(d,ALICE,'loan.close',id); expect(holds(d)).toBe(0);
  });
  it('overdue pickup and return never auto-release custody, and moderator closure does not forge receipts', () => {
    const d=setup(), id=agreed(d); d.clock.now=loan(d,id).pickup.end+7200; d.runReconcile(); expect(loan(d,id).state).toBe('NEEDS_REVIEW'); expect(loan(d,id).custody).toBe('unknown'); expect(holds(d)).toBe(1);
    act(d,MODERATOR,'moderation.loan.resolve',id,{outcome:'unresolved',reason:'The campus moderator is still checking custody.'}); expect(holds(d)).toBe(1);
    act(d,MODERATOR,'moderation.loan.resolve',id,{outcome:'owner',reason:'The lender confirmed that the original item is back.'}); expect(holds(d)).toBe(0); expect(loan(d,id).returnReceipt).toBeUndefined();
    const e=setup(), q=agreed(e);e.clock.now=loan(e,q).pickup.start;act(e,BOB,'loan.pickup',q,{note:''}); e.clock.now=currentReturn(loan(e,q)).end+7200;e.runReconcile();expect(loan(e,q).state).toBe('NEEDS_REVIEW');expect(holds(e)).toBe(1);
  });
  it('extension requests leave due time unchanged and accepted history rejects stale decisions', () => {
    const d=setup(), id=agreed(d);d.clock.now=loan(d,id).pickup.start;act(d,BOB,'loan.pickup',id,{note:''});const due=currentReturn(loan(d,id));
    act(d,BOB,'loan.extend',id,{returnSlot:{...due,start:due.start+86400,end:due.end+86400}});const pending=loan(d,id).extensions[0]; expect(currentReturn(loan(d,id))).toEqual(due);
    const stale=loan(d,id).sequence; act(d,ALICE,'loan.extension.vote',id,{extensionId:pending.id,vote:'accept'});expect(currentReturn(loan(d,id)).start).toBe(due.start+86400);
    expect(()=>d.act(ALICE,'loan.extension.vote',{id,expectedSequence:stale,extensionId:pending.id,vote:'accept'})).toThrow('changed');
    const snap=d.snapshot();snap.state.loans![0].extensions[0].returnSlot.start+=900;expect(()=>d.commit(snap.state,ALICE,'loan.extension.vote')).toThrow();
  });
  it('held listings cannot be edited, and blocking or suspension preserves the hold', () => {
    const d=setup(), id=agreed(d), item=d.snapshot().state.listings[0]; expect(()=>d.act(ALICE,'listing.pause',{id:item.id,expectedVersion:item.version})).toThrow('loan');
    d.act(ALICE,'member.block',{id:BOB,blocked:true});expect(loan(d,id).state).toBe('NEEDS_REVIEW');expect(holds(d)).toBe(1);
    d.act(MODERATOR,'moderation.suspend',{id:ALICE,reason:'A membership review requires preserving the physical item hold.'});expect(holds(d)).toBe(1);
    expect(bootstrapDto(d.snapshot().state,CAROL,d.clock.now).listings.some(l=>l.id===item.id)).toBe(false);
  });
  it('direct SQL cannot forge terms, receipts, active holds, assessments or initial histories', () => {
    const d=setup(), id=agreed(d);let s=d.snapshot();s.state.loans![0].borrowerId=CAROL;expect(()=>d.commit(s.state,ALICE,'loan.vote')).toThrow('LOAN_TERMS_IMMUTABLE');
    s=d.snapshot();s.state.loans![0].pickupReceipt={recipientId:BOB,reportedAt:d.clock.now,note:''};s.state.loans![0].custody='borrower';s.state.loans![0].sequence++;expect(()=>d.commit(s.state,ALICE,'loan.pickup')).toThrow('LOAN_RECEIPT_AUTH');
    expect(()=>d.db.exec('DELETE FROM loan_item_holds')).toThrow('LOAN_HOLD_REQUIRED'); expect(()=>d.db.exec("INSERT INTO loan_item_holds VALUES('campus','fake','fake',1)")).toThrow('LOAN_HOLD_INVALID');
    const seed=createSeed(FIXED_NOW);seed.loans=[loan(d,id)];expect(()=>makeDatabase(':memory:',seed)).toThrow('INITIAL_HISTORY_NOT_EMPTY');
  });
  it('lend-only items accept zero trade wants and legacy records remain unmodified', () => {
    const d=setup(), item=d.snapshot().state.listings[1];d.act(BOB,'listing.save',{id:item.id,expectedVersion:1,title:item.title,description:item.description,categoryId:item.categoryId,catalogId:item.catalogId,condition:item.condition,wants:[],offerMode:'lend',maxLoanDays:7,loanTerms:'Keep all parts together.',publish:true,ownershipConfirmed:true});
    expect(d.snapshot().state.listings[1].wants).toEqual([]);expect(d.snapshot().state.listings[2].offerMode).toBeUndefined();
    d.act(ALICE,'profile.save',{name:'Alice Martin',timezone:'Etc/UTC'});expect(d.snapshot().state.listings[2].offerMode).toBeUndefined();
  });
  it('ordinary loan commands can reconcile an unrelated expired trade', () => {
    const d=setup(), trade=proposeMain(d), id=request(d); d.clock.now=d.snapshot().state.loops[0].deadline;
    // A fresh profile command reconciles both pending histories without holding inventory.
    d.act(CAROL,'profile.save',{name:'Carol Davis',timezone:'Etc/UTC'});expect(d.snapshot().state.loops.find(l=>l.id===trade)?.state).toBe('EXPIRED');expect(loan(d,id).state).toBe('EXPIRED');expect(holds(d)).toBe(0);
  });
  it('does not close an ordinary loan without borrower pickup evidence', () => {
    const d=setup(), id=agreed(d);d.clock.now=loan(d,id).pickup.start;
    expect(()=>act(d,ALICE,'loan.return',id,{note:''})).toThrow('pickup');expect(()=>act(d,ALICE,'loan.close',id)).toThrow('Closing');expect(holds(d)).toBe(1);
  });
  it('moderator calendar maintenance preserves historical pickup and validates outstanding returns', () => {
    const d=setup(), id=agreed(d);d.clock.now=loan(d,id).pickup.start;act(d,BOB,'loan.pickup',id,{note:''});d.clock.now+=3600;
    const windows=d.snapshot().state.venues[0].windows.filter(w=>w.start>d.clock.now);
    d.act(MODERATOR,'moderation.venue',{id:'library',windows});expect(loan(d,id).state).toBe('ON_LOAN');expect(holds(d)).toBe(1);
    d.act(MODERATOR,'moderation.venue',{id:'library',windows:windows.slice(1)});expect(loan(d,id).state).toBe('NEEDS_REVIEW');expect(holds(d)).toBe(1);
  });
  it('moderator membership changes reconcile expired trade proposals in the same transaction', () => {
    const d=setup();proposeMain(d);d.clock.now=d.snapshot().state.loops[0].deadline;
    d.act(MODERATOR,'moderation.suspend',{id:fixtureId(5),reason:'Independent membership case must not block expiry reconciliation.'});expect(d.snapshot().state.loops[0].state).toBe('EXPIRED');
  });
  it('a moderator participant gets one notice during overdue reconciliation and membership changes', () => {
    const d=setup(), id=request(d,MODERATOR);act(d,ALICE,'loan.vote',id,{vote:'accept'});d.clock.now=loan(d,id).pickup.end+7200;
    d.act(ALICE,'member.block',{id:MODERATOR,blocked:true});expect(loan(d,id).state).toBe('NEEDS_REVIEW');expect(holds(d)).toBe(1);
    const ids=d.snapshot().state.notifications.map(n=>n.id);expect(new Set(ids).size).toBe(ids.length);
  });
  it('SQL rejects extension acceptance after the effective due window begins', () => {
    const d=setup(), id=agreed(d);d.clock.now=loan(d,id).pickup.start;act(d,BOB,'loan.pickup',id,{note:''});const due=currentReturn(loan(d,id));act(d,BOB,'loan.extend',id,{returnSlot:{...due,start:due.start+86400,end:due.end+86400}});
    const s=d.snapshot();const extension=s.state.loans![0].extensions[0];s.state.loans![0].sequence++;extension.status='accepted';d.clock.now=due.start;extension.decidedAt=d.clock.now;
    expect(()=>d.commit(s.state,ALICE,'loan.extension.vote')).toThrow('LOAN_EXTENSION_SCHEDULE');expect(currentReturn(loan(d,id))).toEqual(due);
  });
  it('a trade and loan prepared from the same revision cannot both reserve one item', () => {
    const d=setup(), trade=proposeMain(d), id=request(d);d.act(BOB,'loop.vote',{id:trade,expectedVersion:1,vote:'accept'});const base=d.snapshot(), a=structuredClone(base.state), b=structuredClone(base.state);
    // Simulate the two independent writers at the compare-and-swap barrier.
    const op = (awaitOperation: State, actor: string, operation: string, input: unknown) => applyOperation(awaitOperation,actor,operation,input,base.now,crypto.randomUUID());
    op(a,ALICE,'loan.vote',{id,expectedSequence:loan(d,id).sequence,vote:'accept'});op(b,CAROL,'loop.vote',{id:trade,expectedVersion:1,vote:'accept'});
    expect(d.commit(a,ALICE,'loan.vote',base.revision,base.now)).toBeTruthy();expect(d.commit(b,CAROL,'loop.vote',base.revision,base.now)).toBeUndefined();expect(holds(d)).toBe(1);expect(d.snapshot().state.loops[0].state).toBe('PENDING');
  });
  it('closed custody cannot be rewritten by replaying an old pickup acknowledgment', () => {
    const d=setup(), id=closed(d), s=d.snapshot();s.state.loans![0].custody='borrower';s.state.loans![0].sequence++;
    expect(()=>d.commit(s.state,BOB,'loan.pickup')).toThrow('LOAN_CLOSED_IMMUTABLE');expect(loan(d,id).custody).toBe('owner');expect(holds(d)).toBe(0);
  });
  it('operators can close a venue calendar while active custody remains held', () => {
    const d=setup(), id=agreed(d);d.act(MODERATOR,'moderation.venue',{id:'library',windows:[]});expect(loan(d,id).state).toBe('NEEDS_REVIEW');expect(holds(d)).toBe(1);expect(d.snapshot().state.venues[0].windows).toEqual([]);
  });
  it('matching skips overlapping loan appointments and finds the next usable trade slot', () => {
    const seed=createSeed(FIXED_NOW);seed.listings[3].offerMode='both';const d=setup(seed), item=d.snapshot().state.listings[3], start=seed.members[0].availability[0].start+900;
    const result=d.act(ALICE,'loan.request',{listingId:item.id,expectedVersion:1,pickup:{venueId:'library',start,end:start+1800},returnSlot:{venueId:'library',start:start+86400,end:start+86400+1800},accepted:true}) as unknown as {loanId:string};
    act(d,item.ownerId,'loan.vote',result.loanId,{vote:'accept'});
    const matches=findMatches(d.snapshot().state,ALICE,[fixtureId(101)],d.clock.now).candidates;expect(matches).toHaveLength(1);expect(matches[0].options[0].start).toBe(start+1800);
    const candidate=matches[0];expect(()=>d.act(ALICE,'loop.propose',{listingIds:candidate.listingIds,snapshots:candidate.participants.map(({userId,listingVersion,memberVersion,preferenceVersion})=>({userId,listingVersion,memberVersion,preferenceVersion})),option:candidate.options[0],accepted:true})).not.toThrow();
  });
});
describe('role-specific participant assessments', () => {
  it('derives lender and borrower roles, hides early feedback and excludes unknown or disputed answers', () => {
    const d=setup(), id=closed(d);d.act(BOB,'review.submit',{kind:'loan',referenceId:id,answers:{availability:'yes',condition:'yes',terms:'yes'},note:'The disclosed scuffs matched the listing.'});
    const r=d.snapshot().state.reviews![0]; expect(r.role).toBe('lender');expect(r.subjectId).toBe(ALICE);expect(publishedReview(d.snapshot().state,r,d.clock.now)).toBe(false);expect(bootstrapDto(d.snapshot().state,ALICE,d.clock.now).reviews).toEqual([]);
    d.act(ALICE,'review.submit',{kind:'loan',referenceId:id,answers:{returnTiming:'yes',care:'yes',disclosure:'unknown',coordination:'yes'},note:''});
    expect(reputationFor(d.snapshot().state,ALICE,d.clock.now).lender.count).toBe(1);expect(reputationFor(d.snapshot().state,ALICE,d.clock.now).trader.count).toBe(0);expect(reputationFor(d.snapshot().state,ALICE,d.clock.now).lender.score).toBeNull();
    d.act(ALICE,'review.dispute',{id:r.id,reason:'Please review this assessment against the original agreed description.'});expect(reputationFor(d.snapshot().state,ALICE,d.clock.now).lender.count).toBe(0);
    d.act(MODERATOR,'moderation.review.resolve',{id:r.id,expectedDecisions:0,outcome:'supported',reason:'The assessment reflects the disclosed item and the participant reports.'});expect(reputationFor(d.snapshot().state,ALICE,d.clock.now).lender.count).toBe(1);
  });
  it('rejects outsider feedback, duplicate submissions and manufactured observation', () => {
    const d=setup(), id=agreed(d);act(d,BOB,'loan.problem',id,{details:'The lender could not make the planned pickup.'});act(d,MODERATOR,'moderation.loan.resolve',id,{outcome:'owner',reason:'The item remains with the lender; pickup never happened.'});
    const body={kind:'loan',referenceId:id,answers:{availability:'no',condition:'unknown',terms:'unknown'},note:''};expect(()=>d.act(CAROL,'review.submit',body)).toThrow('participants');expect(()=>d.act(BOB,'review.submit',{...body,answers:{...body.answers,condition:'no'}})).toThrow('Did not observe');d.act(BOB,'review.submit',body);expect(()=>d.act(BOB,'review.submit',body)).toThrow('already');
    const s=d.snapshot();s.state.reviews![0].subjectId=CAROL;expect(()=>d.commit(s.state,BOB,'review.submit')).toThrow('REVIEW_IMMUTABLE');
  });
  it('publishes after seven days and leaves users with no history unscored', () => {
    const d=setup(), id=closed(d);d.act(BOB,'review.submit',{kind:'loan',referenceId:id,answers:{availability:'yes',condition:'yes',terms:'unknown'},note:''});d.clock.now+=7*86400;
    expect(publishedReview(d.snapshot().state,d.snapshot().state.reviews![0],d.clock.now)).toBe(true); expect(reputationFor(d.snapshot().state,CAROL,d.clock.now).borrower.score).toBeNull();
  });
  it('three-person trade feedback assesses the direct giver rather than every participant', () => {
    const d=setup(), id=confirmMain(d), loop=d.snapshot().state.loops[0];d.clock.now=loop.start;
    for(const t of loop.transfers)d.act(t.receiverId,'loop.receipt',{id,transferId:t.id,note:''});
    const incoming=loop.transfers.find(t=>t.receiverId===ALICE)!;
    d.act(ALICE,'review.submit',{kind:'trade',referenceId:id,transferId:incoming.id,answers:{availability:'yes',condition:'yes',commitment:'yes'},note:''});
    expect(d.snapshot().state.reviews![0].subjectId).toBe(BOB);expect(d.snapshot().state.reviews![0].role).toBe('trader');expect(reputationFor(d.snapshot().state,CAROL,d.clock.now).trader.count).toBe(0);
    expect(()=>d.act(ALICE,'review.submit',{kind:'trade',referenceId:id,transferId:loop.transfers.find(t=>t.receiverId===BOB)!.id,answers:{availability:'yes',condition:'yes',commitment:'yes'},note:''})).toThrow('agreed to receive');
  });
  it('excluded feedback remains in private audit but disappears from unrelated public profiles', () => {
    const d=setup(), id=closed(d);d.act(BOB,'review.submit',{kind:'loan',referenceId:id,answers:{availability:'yes',condition:'no',terms:'yes'},note:'A disputed description claim.'});d.clock.now+=7*86400;
    const r=d.snapshot().state.reviews![0];d.act(ALICE,'review.dispute',{id:r.id,reason:'The claim contradicts the disclosed condition and item description.'});d.act(MODERATOR,'moderation.review.resolve',{id:r.id,expectedDecisions:0,outcome:'excluded',reason:'The condition was accurately disclosed, and the assessment is excluded.'});
    expect(bootstrapDto(d.snapshot().state,CAROL,d.clock.now).reviews).toEqual([]);expect(bootstrapDto(d.snapshot().state,BOB,d.clock.now).reviews[0].note).toBe(r.note);expect(bootstrapDto(d.snapshot().state,MODERATOR,d.clock.now).reviews[0].decisions).toHaveLength(1);
  });
  it('scores only sufficiently observed histories and treats disclosed wear as honest condition', () => {
    const state=createSeed(FIXED_NOW);state.reviews=Array.from({length:5},(_,i):Review=>({id:fixtureId(2000+i),kind:'loan',referenceId:fixtureId(2100+i),reviewerId:[BOB,CAROL,fixtureId(4)][i%3],subjectId:ALICE,role:'lender',answers:{availability:'yes',condition:'yes',terms:'yes'},note:'The fair-condition item matched the disclosed wear.',createdAt:FIXED_NOW-8*86400,publishAt:FIXED_NOW-86400,status:'submitted',decisions:[]}));
    expect(reputationFor(state,ALICE,FIXED_NOW).lender.score).toBe(100);state.reviews[0].answers.condition='unknown';expect(reputationFor(state,ALICE,FIXED_NOW).lender.dimensions.find(d=>d.key==='condition')?.count).toBe(4);expect(reputationFor(state,ALICE,FIXED_NOW).lender.score).toBe(100);
    state.reviews[0].status='disputed';expect(reputationFor(state,ALICE,FIXED_NOW).lender.score).toBeNull();expect(reputationFor(state,ALICE,FIXED_NOW).borrower.score).toBeNull();
  });
  it('SQL binds trade review eligibility to the actual seven-day closure window', () => {
    const d=setup(), id=confirmMain(d), loop=d.snapshot().state.loops[0];d.clock.now=loop.start;for(const t of loop.transfers)d.act(t.receiverId,'loop.receipt',{id,transferId:t.id,note:''});d.clock.now+=8*86400;
    const s=d.snapshot(), incoming=loop.transfers.find(t=>t.receiverId===ALICE)!;s.state.reviews=[{id:fixtureId(3000),kind:'trade',referenceId:id,transferId:incoming.id,reviewerId:ALICE,subjectId:incoming.giverId,role:'trader',answers:{availability:'yes',condition:'yes',commitment:'yes'},note:'',createdAt:d.clock.now,publishAt:d.clock.now,status:'submitted',decisions:[]}];
    expect(()=>d.commit(s.state,ALICE,'review.submit')).toThrow('TRADE_REVIEW_WINDOW');expect(d.snapshot().state.reviews).toBeUndefined();
  });
});
