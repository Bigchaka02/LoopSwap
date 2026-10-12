import { afterEach, describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { ALICE, BOB, CAROL, MODERATOR, createSeed, fixtureId } from '../../domain/seed';
import { findMatches } from '../../domain/matching';
import { applyOperation } from '../../domain/operations';
import { makeDatabase, proposeMain, confirmMain, FIXED_NOW } from '../helpers';
import type { State } from '../../domain/types';
import { bootstrapDto } from '../../server/dto';
const opened: ReturnType<typeof makeDatabase>[] = [];
const setup = (initial?: State, path?: string) => { const d = makeDatabase(path, initial); opened.push(d); return d; };
const count = (d: ReturnType<typeof makeDatabase>, table: string) => (d.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
afterEach(() => { for (const d of opened.splice(0)) d.close(); });
describe('real SQLite migrations and transactions', () => {
  it('creates no pending holds and commits all holds after independent votes (A09,A10)', () => {
    const d = setup(), id = proposeMain(d);
    expect(count(d,'item_holds')).toBe(0); expect(count(d,'participant_holds')).toBe(0);
    d.act(BOB,'loop.vote',{ id,expectedVersion:1,vote:'accept' });
    expect(count(d,'item_holds')).toBe(0);
    d.act(CAROL,'loop.vote',{ id,expectedVersion:1,vote:'accept' });
    expect(d.snapshot().state.loops[0].state).toBe('CONFIRMED'); expect(count(d,'item_holds')).toBe(3); expect(count(d,'participant_holds')).toBe(3);
    expect(d.snapshot().state.loops[0].version).toBe(1);
  });
  it('retains state, holds, audit, and outbox after an injected transaction failure (A15)', () => {
    const d = setup(), id = proposeMain(d); d.act(BOB,'loop.vote',{ id,expectedVersion:1,vote:'accept' });
    const before = d.snapshot(), events = count(d,'loop_events'), notices = count(d,'notification_outbox');
    d.db.exec("CREATE TRIGGER injected_fail BEFORE INSERT ON participant_holds BEGIN SELECT RAISE(ABORT,'INJECTED_FAILURE'); END");
    expect(() => d.act(CAROL,'loop.vote',{ id,expectedVersion:1,vote:'accept' })).toThrow('INJECTED_FAILURE');
    expect(d.snapshot()).toEqual(before); expect(count(d,'item_holds')).toBe(0); expect(count(d,'participant_holds')).toBe(0); expect(count(d,'loop_events')).toBe(events); expect(count(d,'notification_outbox')).toBe(notices);
  });
  it('checks actual database clock even without running the job (A13)', () => {
    const d = setup(), id = proposeMain(d); d.clock.now = d.snapshot().state.loops[0].deadline;
    const r = d.act(BOB,'loop.vote',{ id,expectedVersion:1,vote:'accept' });
    expect(r.state).toBe('EXPIRED'); expect(count(d,'item_holds')).toBe(0);
    expect(d.snapshot().state.loops[0].participants.find(p => p.userId === BOB)?.vote).toBe('pending');
  });
  it('rejects a commit if the database second changed since the read (A13)', () => {
    const d = setup(), id = proposeMain(d), s = d.snapshot();
    applyOperation(s.state,BOB,'loop.vote',{id,expectedVersion:1,vote:'accept'},s.now,crypto.randomUUID());
    d.clock.now++;
    expect(d.commit(s.state,BOB,'loop.vote',s.revision,s.now)).toBeUndefined();
    expect(d.snapshot().state.loops[0].participants.find(p=>p.userId===BOB)?.vote).toBe('pending');
  });
  it('material edits invalidate pending consent and never edit frozen inventory (A01,A12)', () => {
    const d = setup(), id = proposeMain(d), item = d.snapshot().state.listings[0];
    const body = { id:item.id,expectedVersion:1,title:'A carefully described bike lock',description:item.description,categoryId:item.categoryId,catalogId:item.catalogId,condition:item.condition,wants:item.wants.map(w=>({id:w.id,mode:w.mode,...(w.catalogId?{catalogId:w.catalogId}:{}),...(w.categoryId?{categoryId:w.categoryId}:{}),minCondition:w.minCondition,priority:w.priority})),publish:true,ownershipConfirmed:true };
    d.act(ALICE,'listing.save',body);
    expect(d.snapshot().state.loops.find(l=>l.id===id)?.state).toBe('STALE');
    expect(() => d.act(BOB,'listing.save',{...body,expectedVersion:2})).toThrow('own items');
  });
  it('rejects invalid catalog/category pairs and active-item quotas (A01,A24)', () => {
    const d=setup(), l=d.snapshot().state.listings[0];
    const b={title:'A new item',description:'',categoryId:'accessories',catalogId:'calculator',condition:2,wants:l.wants.map(w=>({mode:w.mode,...(w.catalogId?{catalogId:w.catalogId}:{}),...(w.categoryId?{categoryId:w.categoryId}:{}),minCondition:w.minCondition,priority:w.priority})),publish:true,ownershipConfirmed:true};
    expect(()=>d.act(ALICE,'listing.save',b)).toThrow('catalog');
    expect(()=>d.act(ALICE,'listing.save',{...b,catalogId:null,condition:4})).toThrow('highlighted');
    const valid={...b,catalogId:null}; d.act(ALICE,'listing.save',valid);d.act(ALICE,'listing.save',valid);
    expect(()=>d.act(ALICE,'listing.save',valid)).toThrow('three active');
  });
  it('recipient-only receipts complete exactly once and release every hold (A16,A17)', () => {
    const d=setup(), id=confirmMain(d), loop=d.snapshot().state.loops[0];d.clock.now=loop.start-600;
    const t=loop.transfers.find(t=>t.receiverId===ALICE)!;
    expect(()=>d.act(BOB,'loop.receipt',{id,transferId:t.id,note:''})).toThrow('intended recipient');
    d.act(ALICE,'loop.receipt',{id,transferId:t.id,note:''});const events=count(d,'loop_events');
    d.act(ALICE,'loop.receipt',{id,transferId:t.id,note:''});expect(count(d,'loop_events')).toBe(events);
    for(const transfer of loop.transfers.filter(t=>t.receiverId!==ALICE))d.act(transfer.receiverId,'loop.receipt',{id,transferId:transfer.id,note:''});
    expect(d.snapshot().state.loops[0].state).toBe('COMPLETED');expect(count(d,'item_holds')).toBe(0);expect(count(d,'participant_holds')).toBe(0);
    expect(d.snapshot().state.listings.slice(0,3).map(l=>l.status)).toEqual(['exchanged','exchanged','exchanged']);
  });
  it('rolls back final receipt, archival, holds, audit, and outbox on completion failure (A15)', () => {
    const d=setup(),id=confirmMain(d),loop=d.snapshot().state.loops[0];d.clock.now=loop.start-600;
    for(const t of loop.transfers.slice(0,2))d.act(t.receiverId,'loop.receipt',{id,transferId:t.id,note:''});
    const before=d.snapshot(),events=count(d,'loop_events'),notices=count(d,'notification_outbox');
    d.db.exec("CREATE TRIGGER injected_completion_fail BEFORE DELETE ON item_holds BEGIN SELECT RAISE(ABORT,'INJECTED_COMPLETION_FAILURE'); END");
    const last=loop.transfers[2];expect(()=>d.act(last.receiverId,'loop.receipt',{id,transferId:last.id,note:''})).toThrow('INJECTED_COMPLETION_FAILURE');
    expect(d.snapshot()).toEqual(before);expect(count(d,'item_holds')).toBe(3);expect(count(d,'participant_holds')).toBe(3);expect(count(d,'loop_events')).toBe(events);expect(count(d,'notification_outbox')).toBe(notices);
    d.db.exec('DROP TRIGGER injected_completion_fail');d.act(last.receiverId,'loop.receipt',{id,transferId:last.id,note:''});expect(d.snapshot().state.loops[0].state).toBe('COMPLETED');
  });
  it('cancels safely before meetup and retains holds at or after meetup (A18)', () => {
    const d=setup(),id=confirmMain(d);d.act(ALICE,'loop.cancel',{id,expectedVersion:1});
    expect(count(d,'item_holds')).toBe(0);expect(d.snapshot().state.listings.slice(0,3).every(l=>l.status==='active')).toBe(true);
    const e=setup(),other=confirmMain(e);e.clock.now=e.snapshot().state.loops[0].start;e.act(ALICE,'loop.cancel',{id:other,expectedVersion:1});
    expect(e.snapshot().state.loops[0].state).toBe('NEEDS_REVIEW');expect(count(e,'item_holds')).toBe(3);
  });
  it('partial handoff, open problems, and unresolved moderator outcomes retain holds (A18,A19)', () => {
    const d=setup(),id=confirmMain(d),loop=d.snapshot().state.loops[0];d.clock.now=loop.start-600;
    d.act(ALICE,'loop.receipt',{id,transferId:loop.transfers.find(t=>t.receiverId===ALICE)!.id,note:''});
    d.act(BOB,'loop.problem',{id,kind:'missing_item',details:'The textbook was not handed over.'});
    d.act(CAROL,'loop.cancel',{id,expectedVersion:1});expect(count(d,'item_holds')).toBe(3);
    d.act(MODERATOR,'moderation.resolve',{id,expectedVersion:1,expectedSequence:d.snapshot().state.loops[0].sequence,reason:'The moderator is still checking where each item ended up.',outcomes:loop.transfers.map(t=>({listingId:t.listingId,outcome:'unresolved'}))});
    expect(count(d,'item_holds')).toBe(3);expect(d.snapshot().state.loops[0].state).toBe('NEEDS_REVIEW');
    d.act(MODERATOR,'moderation.resolve',{id,expectedVersion:1,expectedSequence:d.snapshot().state.loops[0].sequence,reason:'Each original owner confirmed their item was returned.',outcomes:loop.transfers.map(t=>({listingId:t.listingId,outcome:'original_owner'}))});
    expect(d.snapshot().state.loops[0].state).toBe('RESOLVED');expect(count(d,'item_holds')).toBe(0);expect(d.snapshot().state.listings.slice(0,3).every(l=>l.status==='paused')).toBe(true);expect(d.snapshot().state.loops[0].transfers.filter(t=>t.receipt)).toHaveLength(1);
  });
  it('overdue reconciliation retains holds and does not duplicate notifications (A19,A29)', () => {
    const d=setup();confirmMain(d);d.clock.now=d.snapshot().state.loops[0].end+7200;d.runReconcile();const events=count(d,'loop_events'),outbox=count(d,'notification_outbox');d.runReconcile();
    expect(d.snapshot().state.loops[0].state).toBe('NEEDS_REVIEW');expect(count(d,'item_holds')).toBe(3);expect(count(d,'loop_events')).toBe(events);expect(count(d,'notification_outbox')).toBe(outbox);
  });
  it('allows the owner to republish a returned item while preserving the resolution (A19)', () => {
    const d=setup(),id=confirmMain(d),loop=d.snapshot().state.loops[0];
    d.act(BOB,'loop.problem',{id,kind:'other',details:'The exchange was called off before any item moved.'});
    d.act(MODERATOR,'moderation.resolve',{id,expectedVersion:1,expectedSequence:d.snapshot().state.loops[0].sequence,reason:'Each participant confirmed all items remain with their original owner.',outcomes:loop.transfers.map(t=>({listingId:t.listingId,outcome:'original_owner'}))});
    const resolved=structuredClone(d.snapshot().state.loops[0]);
    const item=d.snapshot().state.listings.find(l=>l.id===fixtureId(101))!;
    d.act(ALICE,'listing.save',{id:item.id,expectedVersion:item.version,title:item.title,description:item.description,categoryId:item.categoryId,catalogId:item.catalogId,condition:item.condition,wants:item.wants.map(w=>({id:w.id,mode:w.mode,catalogId:w.catalogId,minCondition:w.minCondition,priority:w.priority})),publish:true,ownershipConfirmed:true});
    expect(d.snapshot().state.listings.find(l=>l.id===item.id)?.status).toBe('active');
    expect(d.snapshot().state.loops[0]).toEqual(resolved);
  });
  it('rejects moderator decisions made from an older review sequence (A19)', () => {
    const d=setup(),id=confirmMain(d),loop=d.snapshot().state.loops[0];
    d.act(ALICE,'loop.problem',{id,kind:'other',details:'The group needs help clarifying this handoff.'});
    const stale=d.snapshot().state.loops[0].sequence;
    d.act(BOB,'loop.problem',{id,kind:'other',details:'There is additional information about the handoff.'});
    expect(()=>d.act(MODERATOR,'moderation.resolve',{id,expectedVersion:1,expectedSequence:stale,reason:'This decision must not overwrite the newer participant evidence.',outcomes:loop.transfers.map(t=>({listingId:t.listingId,outcome:'original_owner'}))})).toThrow('review changed');
    expect(d.snapshot().state.loops[0].state).toBe('NEEDS_REVIEW');expect(count(d,'item_holds')).toBe(3);
  });
  it('keeps blocking metadata out of participant event and report responses (A08,A21)', () => {
    const d=setup(),id=confirmMain(d);
    d.act(ALICE,'member.block',{id:BOB,blocked:true});
    const state=d.snapshot().state,bob=bootstrapDto(state,BOB,d.clock.now);
    expect(bob.blockedIds).toEqual([]);expect(bob.problems).toEqual([]);
    expect(bob.events.every(e=>!('actorId' in e)&&!('kind' in e)&&!('operationId' in e))).toBe(true);
    expect(state.events.find(e=>e.loopId===id&&e.kind==='review')?.actorId).toBe(ALICE);
    expect(count(d,'item_holds')).toBe(3);
  });
  it('does not accept a report about another member’s private draft (A20)', () => {
    const d=setup(),item=d.snapshot().state.listings[0];
    d.act(ALICE,'listing.save',{id:item.id,expectedVersion:1,title:item.title,description:item.description,categoryId:item.categoryId,catalogId:item.catalogId,condition:2,wants:item.wants.map(w=>({id:w.id,mode:w.mode,catalogId:w.catalogId,minCondition:w.minCondition,priority:w.priority})),publish:false,ownershipConfirmed:true});
    expect(()=>d.act(BOB,'report.listing',{id:item.id,kind:'other',details:'An attempt to report a draft that is not visible.'})).toThrow('unavailable');
    expect(d.snapshot().state.problems).toHaveLength(0);
  });
  it('direct SQL cannot forge votes, receipts, roles, loop terms, or release required holds (A20,A21)', () => {
    const d=setup(),id=proposeMain(d);
    let s=d.snapshot();s.state.loops[0].participants.find(p=>p.userId===BOB)!.vote='accepted';expect(()=>d.commit(s.state,ALICE,'loop.vote')).toThrow('VOTE_AUTH');
    s=d.snapshot();s.state.members[0].role='moderator';expect(()=>d.commit(s.state,ALICE,'profile.save')).toThrow('PROTECTED_MEMBERSHIP');
    s=d.snapshot();s.state.loops[0].venueId='union';expect(()=>d.commit(s.state,ALICE,'loop.propose')).toThrow('TERMS_IMMUTABLE');
    d.act(BOB,'loop.vote',{id,expectedVersion:1,vote:'accept'});d.act(CAROL,'loop.vote',{id,expectedVersion:1,vote:'accept'});
    expect(()=>d.db.prepare('DELETE FROM item_holds').run()).toThrow('HOLD_REQUIRED');
    s=d.snapshot();s.state.loops[0].state='CANCELLED';s.state.listings.slice(0,3).forEach(l=>l.status='active');expect(()=>d.commit(s.state,fixtureId(4),'loop.cancel')).toThrow('LOOP_TRANSITION_AUTH');
  });
  it('SQL rejects forged wants, phantom hold IDs, missing fields and duplicate JSON keys', () => {
    const d=setup(),s=d.snapshot();const c=findMatches(s.state,ALICE,[s.state.listings[0].id],s.now).candidates[0];
    applyOperation(s.state,ALICE,'loop.propose',{listingIds:c.listingIds,snapshots:c.participants.map(({userId,listingVersion,memberVersion,preferenceVersion})=>({userId,listingVersion,memberVersion,preferenceVersion})),option:c.options[0],accepted:true},s.now,crypto.randomUUID());
    const wrong=structuredClone(s.state);wrong.loops[0].transfers[0].wantId=fixtureId(9999);expect(()=>d.commit(wrong,ALICE,'loop.propose')).toThrow('WANT_CONFORMANCE');
    const phantom=structuredClone(s.state);phantom.loops[0].listingIds[0]=fixtureId(9999);expect(()=>d.commit(phantom,ALICE,'loop.propose')).toThrow();
    const missing=d.snapshot().state;delete (missing.listings[0] as Partial<typeof missing.listings[0]>).condition;expect(()=>d.commit(missing,ALICE,'listing.save')).toThrow('LISTING_SHAPE');
    const duplicate=JSON.stringify(d.snapshot().state).replace('"mode":"demo"','"mode":"demo","mode":"demo"');expect(()=>d.db.prepare("UPDATE communities SET state=?,revision=revision+1,actor_id=?,operation='profile.save'").run(duplicate,ALICE)).toThrow('DUPLICATE_JSON_KEY');
  });
  it('normalizes adjacent availability to preserve TS/SQL scheduling agreement', () => {
    const d=setup(),start=d.snapshot().state.members[0].availability[0].start;
    d.act(ALICE,'preferences.save',{expectedVersion:1,venueIds:['library'],availability:[{start,end:start+1800},{start:start+1800,end:start+3600}]});
    expect(d.snapshot().state.members[0].availability).toEqual([{start,end:start+3600}]);expect(()=>proposeMain(d)).not.toThrow();
  });
  function manyCandidates() {
    const seed=createSeed(FIXED_NOW);
    for(const n of [900,901])seed.listings.push({...structuredClone(seed.listings[0]),id:fixtureId(n),wants:seed.listings[0].wants.map(w=>({...w,id:fixtureId(n+100)}))});
    seed.listings.push({...structuredClone(seed.listings[1]),id:fixtureId(902),wants:seed.listings[1].wants.map(w=>({...w,id:fixtureId(1002)}))});
    const d=setup(seed),s=d.snapshot();
    const candidates=findMatches(s.state,ALICE,[fixtureId(101),fixtureId(900),fixtureId(901)],s.now).candidates;
    const payload=(i:number)=>({listingIds:candidates[i].listingIds,snapshots:candidates[i].participants.map(({userId,listingVersion,memberVersion,preferenceVersion})=>({userId,listingVersion,memberVersion,preferenceVersion})),option:candidates[i].options[0],accepted:true});
    expect(candidates).toHaveLength(6);return {d,payload};
  }
  it('enforces three pending initiated proposals in reducer and direct SQL (A24)', () => {
    const {d,payload}=manyCandidates();for(let i=0;i<3;i++)d.act(ALICE,'loop.propose',payload(i));
    expect(()=>d.act(ALICE,'loop.propose',payload(3))).toThrow('three pending');
    const s=d.snapshot(),old=s.state.loops.shift()!;applyOperation(s.state,ALICE,'loop.propose',payload(3),s.now,crypto.randomUUID());s.state.loops.unshift(old);
    expect(()=>d.commit(s.state,ALICE,'loop.propose')).toThrow('PROPOSAL_CAP');expect(d.snapshot().state.loops).toHaveLength(3);
  });
  it('enforces five initiated proposals in a rolling day, including ended proposals (A24)', () => {
    const {d,payload}=manyCandidates();for(let i=0;i<5;i++){const r=d.act(ALICE,'loop.propose',payload(i));d.act(ALICE,'loop.cancel',{id:r.loopId,expectedVersion:1});}
    expect(()=>d.act(ALICE,'loop.propose',payload(5))).toThrow('five per day');
    const s=d.snapshot(),old=s.state.loops.shift()!;applyOperation(s.state,ALICE,'loop.propose',payload(5),s.now,crypto.randomUUID());s.state.loops.unshift(old);
    expect(()=>d.commit(s.state,ALICE,'loop.propose')).toThrow('PROPOSAL_CAP');
  });
  it('enforces a one-hour decline cooldown in reducer and SQL (A24)', () => {
    const {d,payload}=manyCandidates(),r=d.act(ALICE,'loop.propose',payload(0));d.act(BOB,'loop.vote',{id:r.loopId,expectedVersion:1,vote:'decline'});
    expect(()=>d.act(ALICE,'loop.propose',payload(1))).toThrow('one hour');
    const s=d.snapshot(),old=s.state.loops.shift()!;applyOperation(s.state,ALICE,'loop.propose',payload(1),s.now,crypto.randomUUID());s.state.loops.unshift(old);
    expect(()=>d.commit(s.state,ALICE,'loop.propose')).toThrow('DECLINE_COOLDOWN');
    d.clock.now+=3600;expect(()=>d.act(ALICE,'loop.propose',payload(1))).not.toThrow();
  });
  it('two concurrent SQLite connections cannot confirm overlapping participant reservations (A11)', async () => {
    const dir=mkdtempSync(join(tmpdir(),'loopswap-race-')),path=join(dir,'race.sqlite');const seed=createSeed(FIXED_NOW);
    // Two Alice listings can form different cycles through the same Bob and Carol.
    seed.listings.push({...structuredClone(seed.listings[0]),id:fixtureId(900),title:'Another owned bike lock'});
    const d=setup(seed,path),s=d.snapshot();
    const matches=findMatches(s.state,ALICE,[fixtureId(101),fixtureId(900)],s.now).candidates;
    for(const c of matches){const result=d.act(ALICE,'loop.propose',{listingIds:c.listingIds,snapshots:c.participants.map(({userId,listingVersion,memberVersion,preferenceVersion})=>({userId,listingVersion,memberVersion,preferenceVersion})),option:c.options[0],accepted:true});d.act(BOB,'loop.vote',{id:result.loopId,expectedVersion:1,vote:'accept'});}
    const shared=d.snapshot(),states=shared.state.loops.map(l=>{const state=structuredClone(shared.state);applyOperation(state,CAROL,'loop.vote',{id:l.id,expectedVersion:1,vote:'accept'},shared.now,crypto.randomUUID());return JSON.stringify(state);});
    const gate=new SharedArrayBuffer(4),lock=new Int32Array(gate);
    const code=`const {parentPort,workerData}=require('node:worker_threads');const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(workerData.path);db.function('unixepoch',{varargs:true},()=>workerData.now);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=3000');parentPort.postMessage('ready');const lock=new Int32Array(workerData.gate);Atomics.wait(lock,0,0);try{const r=db.prepare("UPDATE communities SET state=?,revision=revision+1,actor_id=?,operation='loop.vote',updated_at=unixepoch() WHERE id='campus' AND revision=? AND unixepoch()=? RETURNING revision").get(workerData.state,workerData.actor,workerData.revision,workerData.now);parentPort.postMessage({committed:!!r});}catch(e){parentPort.postMessage({error:e.message});}db.close();`;
    const workers=states.map(state=>new Worker(code,{eval:true,workerData:{path,now:shared.now,state,actor:CAROL,revision:shared.revision,gate}}));
    const finished=workers.map(w=>new Promise<{committed?:boolean;error?:string}>((resolve,reject)=>{w.on('message',m=>{if(m!=='ready')resolve(m)});w.on('error',reject)}));
    await Promise.all(workers.map(w=>new Promise<void>(resolve=>w.on('message',m=>{if(m==='ready')resolve()}))));Atomics.store(lock,0,1);Atomics.notify(lock,0,2);
    const results=await Promise.all(finished);expect(results.filter(r=>r.committed)).toHaveLength(1);expect(results.some(r=>r.error)).toBe(false);
    const loser=d.snapshot().state.loops.find(l=>l.state==='PENDING')!;expect(d.act(CAROL,'loop.vote',{id:loser.id,expectedVersion:1,vote:'accept'}).state).toBe('CONFLICTED');
    expect(d.snapshot().state.loops.filter(l=>l.state==='CONFIRMED')).toHaveLength(1);expect(count(d,'item_holds')).toBe(3);expect(count(d,'participant_holds')).toBe(3);
    await Promise.all(workers.map(w=>w.terminate()));d.close();opened.splice(opened.indexOf(d),1);rmSync(dir,{recursive:true,force:true});
  });
});
