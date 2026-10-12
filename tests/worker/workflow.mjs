import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createServer } from 'vite';
import jpeg from 'jpeg-js';
const require = createRequire(import.meta.url);
const { Miniflare } = require(require.resolve('miniflare', { paths: [require.resolve('wrangler/package.json')] }));
const root = resolve('.'), origin = 'https://loopswap.test';
const serverRoot = resolve(root, 'dist/server');
const modulePaths = readdirSync(serverRoot, { recursive: true }).filter(p => /\.(m?js|wasm)$/.test(p));
const entry = 'index.js';
const compiledModules = [entry, ...modulePaths.filter(p => p !== entry)].map(p => ({
  type: p.endsWith('.wasm') ? 'CompiledWasm' : 'ESModule', path: resolve(serverRoot, p),
}));
const fixture = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const alice = fixture(1), bob = fixture(2), carol = fixture(3), maya = fixture(4);
const createRuntime = mode => new Miniflare({
  name: `loopswap-${mode}`, modules: compiledModules, modulesRoot: serverRoot,
  compatibilityDate:'2026-05-15', compatibilityFlags:['nodejs_compat'],
  bindings:{ LOOPSWAP_MODE:mode, LOOPSWAP_JOB_SECRET:'isolated-test-job-key' }, d1Databases:{ DB:`campus-${mode}` }, r2Buckets:{ BUCKET:`photos-${mode}` }, cf:false,
  assets:{ directory:resolve(root,'dist/client'), binding:'ASSETS', workerName:`loopswap-${mode}`, routerConfig:{ has_user_worker:true, invoke_user_worker_ahead_of_assets:false } },
});
const runtimes = [];
async function runtime(mode) {
  const mf=createRuntime(mode);runtimes.push(mf);await mf.ready;
  const db=await mf.getD1Database('DB');
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) {
    for(const statement of readFileSync(`drizzle/${file}`,'utf8').split('--> statement-breakpoint').filter(s=>s.trim())) await db.prepare(statement).run();
  }
  assert.equal((await db.prepare('PRAGMA quick_check').first()).quick_check,'ok');
  return {mf,db};
}
function client(mf, initialCookie='') {
  let cookie=initialCookie;
  async function request(path,init={}) {
    const res=await mf.dispatchFetch(origin+path,{...init,headers:{...(cookie?{Cookie:cookie}:{}),...init.headers}});
    const setCookie=res.headers.get('Set-Cookie');if(setCookie)cookie=setCookie.split(';')[0];
    return res;
  }
  return { get cookie(){return cookie;}, request, async call(path,body,key,method='POST',extra={}) {
    const res=await request(path,{ method:body===undefined?'GET':method, headers:{ ...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json'}), ...(key?{'Idempotency-Key':key}:{}), ...extra }, ...(body===undefined?{}:{body:JSON.stringify(body)}) });
    const contentType=res.headers.get('Content-Type')??'';
    return {status:res.status,headers:res.headers,body:contentType.includes('json')?await res.json():await res.text()};
  }};
}
const results=[];
function pass(name){results.push(name);console.log(`PASS ${name}`);}
try {
  const {mf,db}=await runtime('demo'), anon=client(mf);
  let response=await anon.call('/api/bootstrap');assert.equal(response.status,200,typeof response.body === 'string' ? response.body : JSON.stringify(response.body));assert.equal(response.body.data.sample,true);assert.equal(response.body.data.actor,null);assert.equal(response.body.data.listings.length,36);assert.deepEqual(response.body.data.feedbackOpportunities,[]);
  assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0');
  assert.equal((await anon.call('/api/listings')).status,401);pass('Anonymous boundaries and private caching (A20,A28)');
  const a=client(mf),b=client(mf),c=client(mf),m=client(mf);
  for(const [account,id]of[[a,alice],[b,bob],[c,carol],[m,maya]]){response=await account.call('/api/demo/session',{memberId:id});assert.equal(response.status,200,JSON.stringify(response.body));assert.ok(account.cookie.includes('loopswap_demo_session='));}
  assert.notEqual(a.cookie,b.cookie);assert.notEqual(b.cookie,c.cookie);
  const boot=(await a.call('/api/bootstrap')).body.data;assert.equal(boot.actor.id,alice);assert.equal(boot.listings.length,36);
  assert.ok(boot.members.every(p=>!('availability'in p)&&!('venueIds'in p)&&!('email'in p)));assert.ok(boot.venues.every(v=>!('windows'in v)));pass('Three separate DB-backed sessions and schedule privacy (A20,A21)');
  const matchStart=performance.now();const matching=await a.call('/api/matches',{offeredIds:[fixture(101)]});const latency=performance.now()-matchStart;assert.equal(matching.status,200,JSON.stringify(matching.body));
  const candidate=matching.body.data.candidates[0];assert.deepEqual(candidate.transfers.map(t=>[t.giverId,t.receiverId]),[[alice,carol],[carol,bob],[bob,alice]]);pass('Compiled Worker discovers the exact cycle from stored data (A02)');
  const proposal={listingIds:candidate.listingIds,snapshots:candidate.participants.map(({userId,listingVersion,memberVersion,preferenceVersion})=>({userId,listingVersion,memberVersion,preferenceVersion})),option:candidate.options[0],accepted:true};
  const key=crypto.randomUUID(),created=await a.call('/api/loops',proposal,key);assert.equal(created.status,200,JSON.stringify(created.body));const id=created.body.data.loopId;
  assert.equal((await db.prepare('SELECT count(*) AS n FROM item_holds').first()).n,0);
  const again=await a.call('/api/loops',proposal,key);assert.deepEqual(again.body.data,created.body.data);
  const changed=await a.call('/api/loops',{...proposal,accepted:false},key);assert.equal(changed.status,409);pass('Pending has no holds; identical requests replay and changed bodies conflict (A09,A14)');
  assert.equal((await m.call(`/api/loops/${id}`)).status,404);
  assert.equal((await m.call(`/api/loops/${id}/vote`,{expectedVersion:1,vote:'accept'},crypto.randomUUID())).status,404);
  assert.equal((await b.call(`/api/loops/${id}/vote`,{expectedVersion:1,vote:'accept',actorId:carol},crypto.randomUUID())).status,400);
  assert.equal((await b.call('/api/action',{operation:'moderation.suspend',payload:{id:alice,reason:'Attempted unauthorized suspension.'}},crypto.randomUUID())).status,403);pass('Nonparticipants, forged actors, and unauthorized moderators are denied (A20,A21)');
  // A different Alice item forms a competing cycle through Bob and Carol.
  const first=boot.listings.find(l=>l.id===fixture(101));
  const saved=await a.call('/api/listings',{title:'Another available bike lock',description:'A separate synthetic lock owned by Alice.',categoryId:first.categoryId,catalogId:first.catalogId,condition:2,wants:first.wants.map(w=>({mode:w.mode,...(w.catalogId?{catalogId:w.catalogId}:{}),...(w.categoryId?{categoryId:w.categoryId}:{}),minCondition:w.minCondition,priority:w.priority})),publish:true,ownershipConfirmed:true},crypto.randomUUID());assert.equal(saved.status,200,JSON.stringify(saved.body));
  const secondId=saved.body.data.listingId,secondCandidate=(await a.call('/api/matches',{offeredIds:[secondId]})).body.data.candidates[0];
  const second=await a.call('/api/loops',{listingIds:secondCandidate.listingIds,snapshots:secondCandidate.participants.map(({userId,listingVersion,memberVersion,preferenceVersion})=>({userId,listingVersion,memberVersion,preferenceVersion})),option:secondCandidate.options[0],accepted:true},crypto.randomUUID());assert.equal(second.status,200,JSON.stringify(second.body));const other=second.body.data.loopId;
  for(const loopId of[id,other]){response=await b.call(`/api/loops/${loopId}/vote`,{expectedVersion:1,vote:'accept'},crypto.randomUUID());assert.equal(response.status,200,JSON.stringify(response.body));}
  const raced=await Promise.all([id,other].map(loopId=>c.call(`/api/loops/${loopId}/vote`,{expectedVersion:1,vote:'accept'},crypto.randomUUID())));assert.ok(raced.every(r=>r.status===200),JSON.stringify(raced.map(r=>r.body)));assert.deepEqual(raced.map(r=>r.body.data.state).sort(),['CONFIRMED','CONFLICTED']);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM item_holds').first()).n,3);assert.equal((await db.prepare('SELECT count(*) AS n FROM participant_holds').first()).n,3);pass('Actual concurrent D1/Worker confirmations reserve one whole loop (A10,A11)');
  const confirmed=raced[0].body.data.state==='CONFIRMED'?id:other;
  const detail=(await a.call(`/api/loops/${confirmed}`)).body.data;
  const wrongTransfer=detail.transfers.find(t=>t.receiverId===alice);
  assert.equal((await b.call(`/api/transfers/${wrongTransfer.id}/receipt`,{note:''},crypto.randomUUID())).status,403);
  assert.equal((await a.call(`/api/transfers/${wrongTransfer.id}/receipt`,{note:''},crypto.randomUUID())).status,400);pass('Recipient authorization and real receipt-opening clock (A16)');
  const reconnected=client(mf,a.cookie);assert.equal((await reconnected.call(`/api/loops/${confirmed}`)).body.data.state,'CONFIRMED');pass('Reconnect refetches committed exchange state (A23)');
  response=await c.call(`/api/loops/${confirmed}/problem`,{kind:'other',details:'A synthetic coordination concern needs moderator review.'},crypto.randomUUID());assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.data.state,'NEEDS_REVIEW');assert.equal((await db.prepare('SELECT count(*) AS n FROM item_holds').first()).n,3);
  const moderator=client(mf);assert.equal((await moderator.call('/api/demo/session',{memberId:fixture(16)})).status,200);
  const reviewed=(await moderator.call(`/api/loops/${confirmed}`)).body.data;
  response=await moderator.call(`/api/moderation/${confirmed}/resolve`,{expectedVersion:1,expectedSequence:reviewed.sequence,reason:'The fictional participants confirmed each item remains with its original owner.',outcomes:reviewed.transfers.map(t=>({listingId:t.listingId,outcome:'original_owner'}))},crypto.randomUUID());assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.data.state,'RESOLVED');assert.equal((await db.prepare('SELECT count(*) AS n FROM item_holds').first()).n,0);
  const resolved=(await a.call(`/api/loops/${confirmed}`)).body.data;assert.ok(resolved.transfers.every(t=>!t.receipt));pass('Review retains holds and moderator outcomes never forge receipts (A19)');
  const command=async(account,operation,payload,key=crypto.randomUUID())=>account.call('/api/action',{operation,payload},key);
  const ownItem=(await a.call('/api/bootstrap')).body.data.listings.find(l=>l.id===fixture(101));
  response=await command(a,'listing.save',{id:ownItem.id,expectedVersion:ownItem.version,title:ownItem.title,description:ownItem.description,categoryId:ownItem.categoryId,catalogId:ownItem.catalogId,condition:ownItem.condition,wants:ownItem.wants.map(({id,mode,categoryId,catalogId,minCondition,priority})=>({id,mode,...(categoryId?{categoryId}:{}),...(catalogId?{catalogId}:{}),minCondition,priority})),offerMode:'both',maxLoanDays:7,loanTerms:'Keep both keys with the lock.',publish:true,ownershipConfirmed:true});assert.equal(response.status,200,JSON.stringify(response.body));
  const loanOptions=await b.call('/api/loan/options',{listingId:ownItem.id});assert.equal(loanOptions.status,200,JSON.stringify(loanOptions.body));assert.ok(loanOptions.body.data.options.length);assert.ok(loanOptions.body.data.returnWindows.length);
  const pickup=loanOptions.body.data.options[0],loanBody={listingId:ownItem.id,expectedVersion:response.body.data.version,pickup,returnSlot:{...pickup,start:pickup.start+86400,end:pickup.end+86400},accepted:true},loanKey=crypto.randomUUID();
  const requested=await command(b,'loan.request',loanBody,loanKey);assert.equal(requested.status,200,JSON.stringify(requested.body));const loanId=requested.body.data.loanId;assert.equal((await db.prepare('SELECT count(*) AS n FROM loan_item_holds').first()).n,0);assert.deepEqual((await command(b,'loan.request',loanBody,loanKey)).body.data,requested.body.data);
  assert.equal((await m.call(`/api/loans/${loanId}`)).status,404);assert.equal((await command(m,'loan.cancel',{id:loanId,expectedSequence:1})).status,404);
  response=await command(a,'loan.vote',{id:loanId,expectedSequence:1,vote:'accept'});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.data.state,'RESERVED');assert.equal((await db.prepare('SELECT count(*) AS n FROM loan_item_holds').first()).n,1);
  const held=(await a.call('/api/bootstrap')).body.data.listings.find(l=>l.id===ownItem.id);assert.equal(held.loanHeld,true);assert.equal((await a.call('/api/matches',{offeredIds:[ownItem.id]})).body.data.candidates.length,0);
  assert.equal((await command(a,'loan.pickup',{id:loanId,expectedSequence:2,note:''})).status,403);assert.equal((await command(b,'loan.pickup',{id:loanId,expectedSequence:2,note:''})).status,400);assert.equal((await command(a,'loan.return',{id:loanId,expectedSequence:2,note:''})).status,409);
  assert.equal((await command(a,'listing.pause',{id:ownItem.id,expectedVersion:held.version})).status,409);assert.ok((await m.call('/api/bootstrap')).body.data.events.every(e=>e.loanId!==loanId));
  response=await command(b,'loan.cancel',{id:loanId,expectedSequence:2});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal((await db.prepare('SELECT count(*) AS n FROM loan_item_holds').first()).n,0);
  pass('Compiled Worker loan requests, authoritative holds, recipient clocks, private evidence, and safe cancellation');
  const secondLoan=await command(b,'loan.request',loanBody);assert.equal(secondLoan.status,200,JSON.stringify(secondLoan.body));const caseId=secondLoan.body.data.loanId;
  assert.equal((await command(a,'loan.vote',{id:caseId,expectedSequence:1,vote:'accept'})).status,200);
  assert.equal((await command(b,'loan.problem',{id:caseId,expectedSequence:2,details:'The synthetic loan was called off before physical pickup.'})).status,200);
  response=await command(moderator,'moderation.loan.resolve',{id:caseId,expectedSequence:3,outcome:'owner',reason:'The original lender retained the item; no physical pickup occurred.'});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.data.state,'RESOLVED');assert.equal((await db.prepare('SELECT count(*) AS n FROM loan_item_holds').first()).n,0);
  const evidence=(await a.call(`/api/loans/${caseId}`)).body.data;assert.equal(evidence.pickupReceipt,undefined);assert.equal(evidence.returnReceipt,undefined);
  for(const account of[a,b]){const available=(await account.call('/api/bootstrap')).body.data.feedbackOpportunities.find(o=>o.kind==='loan'&&o.referenceId===caseId);assert.deepEqual(available,{kind:'loan',referenceId:caseId,closesAt:evidence.closedAt+604800});}
  assert.ok(!(await moderator.call('/api/bootstrap')).body.data.feedbackOpportunities.some(o=>o.referenceId===caseId));
  response=await command(b,'review.submit',{kind:'loan',referenceId:caseId,answers:{availability:'yes',condition:'no',terms:'unknown'},note:''});assert.equal(response.status,400);
  const lenderAssessment={kind:'loan',referenceId:caseId,answers:{availability:'yes',condition:'unknown',terms:'unknown'},note:'No physical condition observation.'},reviewKey=crypto.randomUUID();
  response=await command(b,'review.submit',lenderAssessment,reviewKey);assert.equal(response.status,200,JSON.stringify(response.body));const reviewId=response.body.data.reviewId;assert.equal((await command(b,'review.submit',lenderAssessment,reviewKey)).body.data.reviewId,reviewId);
  assert.ok(!(await a.call('/api/bootstrap')).body.data.reviews.some(r=>r.id===reviewId));assert.equal((await command(b,'review.submit',lenderAssessment)).status,409);assert.equal((await command(m,'review.submit',lenderAssessment)).status,403);
  response=await command(a,'review.submit',{kind:'loan',referenceId:caseId,answers:{returnTiming:'unknown',care:'unknown',disclosure:'unknown',coordination:'unknown'},note:''});assert.equal(response.status,200,JSON.stringify(response.body));
  for(const account of[a,b])assert.ok(!(await account.call('/api/bootstrap')).body.data.feedbackOpportunities.some(o=>o.referenceId===caseId));
  pass('Bootstrap exposes only own eligible feedback with authoritative deadlines and removes submitted reminders');
  const publicFeedback=(await m.call('/api/bootstrap')).body.data;assert.ok(publicFeedback.reviews.some(r=>r.id===reviewId&&r.published));assert.equal(publicFeedback.reputations[alice].lender.count,1);assert.equal(publicFeedback.reputations[alice].lender.score,null);assert.equal(publicFeedback.reputations[alice].trader.count,0);assert.equal(publicFeedback.reputations[bob].borrower.count,0);
  response=await command(a,'review.dispute',{id:reviewId,reason:'This participant assessment needs review against the original agreement.'});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal((await m.call('/api/bootstrap')).body.data.reputations[alice].lender.count,0);
  response=await command(moderator,'moderation.review.resolve',{id:reviewId,expectedDecisions:0,outcome:'excluded',reason:'The disputed assessment is excluded after reviewing the original terms.'});assert.equal(response.status,200,JSON.stringify(response.body));assert.ok(!(await m.call('/api/bootstrap')).body.data.reviews.some(r=>r.id===reviewId));assert.ok((await b.call('/api/bootstrap')).body.data.reviews.some(r=>r.id===reviewId));
  pass('Compiled Worker role-derived blind feedback, observation limits, retry deduplication, disputes, and excluded-review privacy');
  const operatorBoot=(await moderator.call('/api/bootstrap')).body.data;assert.ok(operatorBoot.venueWindows.length);
  response=await command(moderator,'moderation.venue',{id:'library',windows:operatorBoot.venueWindows.find(v=>v.id==='library').windows});assert.equal(response.status,200,JSON.stringify(response.body));assert.equal((await command(b,'moderation.venue',{id:'library',windows:operatorBoot.venueWindows[0].windows})).status,403);
  pass('Operator-only venue calendar remains separate from private member availability');
  const badOrigin=await a.call('/api/action',{operation:'profile.save',payload:{name:'Alice',timezone:'Etc/UTC'}},crypto.randomUUID(),'POST',{Origin:'https://attacker.test'});assert.equal(badOrigin.status,403);pass('Cross-origin writes are denied');
  assert.equal((await anon.call('/api/jobs/reconcile',{})).status,403);
  assert.equal((await a.call('/api/action',{operation:'profile.save',payload:{name:'é'.repeat(40000),timezone:'Etc/UTC'}},crypto.randomUUID())).status,400);
  assert.equal((await a.call('/api/photos',{data:'<svg><script>bad</script></svg>'},crypto.randomUUID())).status,400);pass('Oversized writes and unsupported upload formats are rejected');
  const photoBytes=new Uint8Array(jpeg.encode({width:2,height:2,data:new Uint8Array(16).fill(255)},80).data),photoKey=crypto.randomUUID();
  const upload=(account,bytes=photoBytes,key=photoKey,extra={})=>account.request('/api/photos',{method:'POST',headers:{Origin:origin,'Content-Type':'image/jpeg','Idempotency-Key':key,...extra},body:bytes});
  assert.equal((await upload(anon)).status,401);
  assert.equal((await upload(a,photoBytes,crypto.randomUUID(),{Origin:'https://attacker.test'})).status,403);
  assert.equal((await upload(a,new TextEncoder().encode('<svg>not a jpeg</svg>'),crypto.randomUUID())).status,400);
  assert.equal((await upload(a,new Uint8Array(1000001),crypto.randomUUID())).status,400);
  const photoResults=await Promise.all([upload(a),upload(a)]);assert.ok(photoResults.every(r=>r.status===200),await Promise.all(photoResults.map(r=>r.clone().text())));
  const photo=(await photoResults[0].json()).data.photo;assert.equal((await (await upload(a)).json()).data.photo,photo);
  const different=new Uint8Array(jpeg.encode({width:2,height:2,data:new Uint8Array(16).fill(128)},80).data);assert.equal((await upload(a,different)).status,409);
  const saveBody=item=>({id:item.id,expectedVersion:item.version,title:item.title,description:item.description,categoryId:item.categoryId,catalogId:item.catalogId,condition:item.condition,wants:item.wants.map(({id,mode,categoryId,catalogId,minCondition,priority})=>({id,mode,...(categoryId?{categoryId}:{}),...(catalogId?{catalogId}:{}),minCondition,priority})),offerMode:'both',maxLoanDays:7,loanTerms:'Keep both keys with the lock.',ownershipConfirmed:true});
  const draft=await a.call('/api/listings',{...saveBody(ownItem),id:undefined,expectedVersion:undefined,title:'Private photo draft',photo,photoAlt:'Synthetic test photo',publish:false},crypto.randomUUID());assert.equal(draft.status,200,JSON.stringify(draft.body));
  let image=await a.request(photo);assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/jpeg');assert.equal(image.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(image.headers.get('Cache-Control'),'private, no-store, max-age=0');assert.ok((await image.arrayBuffer()).byteLength);
  assert.equal((await b.request(photo)).status,404);assert.equal((await anon.request(photo)).status,401);assert.equal((await moderator.request(photo)).status,200);
  assert.equal((await b.call('/api/listings',{...saveBody(boot.listings.find(l=>l.ownerId===bob)),id:undefined,expectedVersion:undefined,photo,publish:false},crypto.randomUUID())).status,400);
  pass('Private photo upload validates pixels, deduplicates concurrent retries, and denies foreign attachment/draft access');
  const pixels=new Uint8Array(900*900*4);let random=42;
  for(let n=0;n<pixels.length;n++){random=(Math.imul(random,1664525)+1013904223)>>>0;pixels[n]=n%4===3?255:random>>>24;}
  const fullSize=new Uint8Array(jpeg.encode({width:900,height:900,data:pixels},65).data);assert.ok(fullSize.byteLength<=1000000);
  const photoStart=performance.now(),fullUpload=await upload(a,fullSize,crypto.randomUUID()),photoUploadMs=Number((performance.now()-photoStart).toFixed(2));assert.equal(fullUpload.status,200,await fullUpload.clone().text());
  const fullPhoto=(await fullUpload.json()).data;assert.equal(fullPhoto.width,900);assert.equal(fullPhoto.height,900);
  image=await a.request(fullPhoto.photo);assert.equal(image.status,200);assert.ok((await image.arrayBuffer()).byteLength<=1000000);
  pass('Compiled Worker accepts and serves a maximum-size 900-pixel photo');
  const current=(await a.call('/api/bootstrap')).body.data.listings.find(l=>l.id===ownItem.id);
  response=await command(a,'listing.save',{...saveBody(current),photo,photoAlt:'Synthetic test photo',publish:true});assert.equal(response.status,200,JSON.stringify(response.body));
  const withPhoto=(await a.call('/api/bootstrap')).body.data.listings.find(l=>l.id===ownItem.id);
  const photoLoan=await command(b,'loan.request',{...loanBody,expectedVersion:withPhoto.version});assert.equal(photoLoan.status,200,JSON.stringify(photoLoan.body));
  assert.equal((await command(b,'loan.cancel',{id:photoLoan.body.data.loanId,expectedSequence:1})).status,200);
  response=await command(a,'listing.save',{...saveBody(withPhoto),photo:null,publish:false});assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal((await b.request(photo)).status,200);assert.equal((await m.request(photo)).status,404);
  pass('Agreement participants retain private photo snapshots after source removal');
  assert.equal((await a.call('/api/maintenance')).status,403);assert.equal((await a.call('/api/maintenance/photos',{})).status,403);
  const readiness=await moderator.call('/api/maintenance');assert.equal(readiness.status,200);assert.equal(readiness.body.data.photos,true);assert.equal(readiness.body.data.jobSecretConfigured,true);
  assert.equal((await moderator.call('/api/maintenance/photos',{})).status,200);
  const health=await anon.call('/api/health');assert.equal(health.status,200);assert.equal(health.body.ready,true);assert.equal(health.body.schema,8);assert.equal(health.body.photosReady,true);
  await db.prepare("INSERT INTO demo_sessions(token_hash,member_id,community_id,expires_at) VALUES(?,?,'campus',unixepoch()-1)").bind('expired-fixture',alice).run();
  assert.equal((await anon.call('/api/jobs/reconcile',{},undefined,'POST',{Authorization:'Bearer wrong'})).status,403);
  const reconciled=await anon.call('/api/jobs/reconcile',{},undefined,'POST',{Authorization:'Bearer isolated-test-job-key'});assert.equal(reconciled.status,200,JSON.stringify(reconciled.body));
  assert.equal(await db.prepare("SELECT token_hash FROM demo_sessions WHERE token_hash='expired-fixture'").first(),null);assert.equal((await a.call('/api/bootstrap')).body.data.actor.id,alice);
  pass('DB health and moderator readiness work; authenticated maintenance prunes expired sessions without breaking active ones');
  const {mf:pilot}=await runtime('pilot'),p=client(pilot);assert.equal((await p.call('/api/demo/session',{memberId:alice})).status,404);assert.equal((await p.call('/api/listings',undefined,undefined,'GET',{'oai-authenticated-user-id':alice,'oai-authenticated-user-email':'fake@example.test'})).status,401);pass('Pilot mode rejects demo sign-in and unprovisioned identities (A30)');
  const waiting=await p.call('/api/bootstrap',undefined,undefined,'GET',{'oai-authenticated-user-id':alice,'oai-authenticated-user-email':'fake@example.test'});assert.equal(waiting.status,200);assert.equal(waiting.body.data.authStatus,'awaiting_membership');assert.equal(waiting.body.data.actor,null);assert.deepEqual(waiting.body.data.listings,[]);
  assert.equal((await command(moderator,'moderation.suspend',{id:maya,reason:'Synthetic test of inactive membership recovery.'})).status,200);
  const suspended=(await m.call('/api/bootstrap')).body.data;assert.equal(suspended.authStatus,'suspended');assert.equal(suspended.actor,null);assert.deepEqual(suspended.loans,[]);assert.deepEqual(suspended.events,[]);assert.equal((await m.request(photo)).status,403);
  pass('Unprovisioned and suspended identity recovery reveals status without private community state');
  const html=await anon.call('/browse');assert.equal(html.status,200);assert.ok(html.body.includes('LoopSwap'));
  for(const target of ['/listings/new','listings','activity','matches','loops','loans','settings','help','moderation'].map(path=>'/' + path.replace(/^\//,''))){const page=await a.call(target);assert.equal(page.status,200,target);assert.ok(page.body.includes('LoopSwap'),target);const rsc=await a.request(`${target}?_rsc`,{headers:{RSC:'1'}});assert.equal(rsc.status,200,target);assert.ok((await rsc.text()).includes('"path":' + JSON.stringify(target.slice(1).split('/'))),target);}
  const assetPaths=[...html.body.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g)].map(match=>match[1]);assert.ok(assetPaths.some(p=>p.endsWith('.js')));assert.ok(assetPaths.some(p=>p.endsWith('.css')));
  for(const path of new Set(assetPaths)){const resource=await mf.dispatchFetch(new URL(path,origin).href);assert.equal(resource.status,200,path);assert.match(resource.headers.get('Content-Type'),path.endsWith('.js')?/(?:javascript|ecmascript)/:/text\/css/,path);assert.ok(!(await resource.text()).startsWith('<!DOCTYPE'),path);}
  pass('All navigation target documents/RSC routes and actual JavaScript/CSS assets are served with correct types');
  for(const file of['bike-lock','calculator','textbook']){const asset=await mf.dispatchFetch(`${origin}/images/${file}.webp`);assert.equal(asset.status,200);assert.ok(asset.headers.get('Content-Type').includes('image/webp'));assert.ok((await asset.arrayBuffer()).byteLength>10000);}
  pass('Compiled app serves the product route and its three actual image assets');
  const compiler=await createServer({configFile:false,server:{middlewareMode:true},appType:'custom'});
  let benchmark;
  try {
    const {ActionRequests}=await compiler.ssrLoadModule('/lib/api-client.ts');
    const originalFetch=globalThis.fetch,requestKeys=[];let loseReply=true;
    const recoverBody={...saveBody(current),id:undefined,expectedVersion:undefined,title:'Recovered request draft',photo:null,publish:false};
    try {
      globalThis.fetch=async(input,init)=>{
        if(typeof input!=='string'||!input.startsWith('/api/'))return originalFetch(input,init);
        const headers=new Headers(init?.headers);headers.set('Cookie',a.cookie);headers.set('Origin',origin);requestKeys.push(headers.get('Idempotency-Key'));
        const reply=await mf.dispatchFetch(origin+input,{method:init?.method,headers,body:init?.body});assert.equal(reply.status,200,await reply.clone().text());
        if(loseReply){loseReply=false;return new Response('<html>reply interrupted after commit</html>');}return reply;
      };
      const queue=new ActionRequests();
      await assert.rejects(()=>queue.perform(alice,'listing.save',recoverBody),error=>error.code==='UNCONFIRMED_RESPONSE');
      const recovered=await queue.perform(alice,'listing.save',recoverBody);assert.equal(requestKeys.length,2);assert.equal(requestKeys[0],requestKeys[1]);
      const snapshot=JSON.parse((await db.prepare("SELECT state FROM communities WHERE id='campus'").first()).state);
      const rows=snapshot.listings.filter(l=>l.title===recoverBody.title);assert.equal(rows.length,1);assert.equal(rows[0].id,recovered.listingId);
      pass('Client retry after a committed-but-unreadable response replays the same key and creates one listing');
    } finally {globalThis.fetch=originalFetch;}
    const {benchmarkState}=await compiler.ssrLoadModule('/tests/fixtures/benchmark.ts');
    const {mf:perfWorker,db:perfDb}=await runtime('demo');
    const clock=await perfDb.prepare('SELECT unixepoch() AS now').first();
    await perfDb.prepare("INSERT INTO communities(id,mode,state) VALUES('campus','demo',?)").bind(JSON.stringify(benchmarkState(clock.now))).run();
    const perfClient=client(perfWorker);assert.equal((await perfClient.call('/api/demo/session',{memberId:alice})).status,200);
    const timings=[];
    for(let i=0;i<7;i++){const begin=performance.now();const r=await perfClient.call('/api/matches',{offeredIds:[fixture(101)]});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.data.candidates.length,20);timings.push(performance.now()-begin);}
    const sorted=timings.slice(1).sort((x,y)=>x-y);
    benchmark={dataset:250,runs:7,coldMs:Number(timings[0].toFixed(2)),warmMedianMs:Number(((sorted[2]+sorted[3])/2).toFixed(2)),slowestMs:Number(Math.max(...timings).toFixed(2)),scope:'full compiled Worker HTTP request, real D1 read, matching, JSON response'};
    pass('Fresh 250-listing D1 dataset returns bounded matches');
  } finally {await compiler.close();}
  console.log(JSON.stringify({checks:results.length,matchLatencyMs:Number(latency.toFixed(2)),photoUploadMs,dataset:36,benchmark,browserQa:'unverified: supervised preview unavailable',fullBrowserReceiptJourney:'unverified'},null,2));
} finally {for(const mf of runtimes)await mf.dispose();}
