import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

// Operator-run browser gate. No substitute dev server is started by this test.
const base=process.env.LOOPSWAP_E2E_BASE_URL;
if(!base){console.error('UNVERIFIED: set LOOPSWAP_E2E_BASE_URL to an explicitly authorized isolated demo preview. This script does not launch a server.');process.exit(78);}
const url=new URL(base);
if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an ordinary authorized preview origin.');
let browser;
try {browser=await chromium.launch();} catch {console.error('UNVERIFIED: Playwright Chromium is unavailable. Install it in the permitted browser-testing environment.');process.exit(78);}
const contexts=[];
mkdirSync('test-results',{recursive:true});
async function account(name,viewport={width:1440,height:1000}) {
  const context=await browser.newContext({viewport});contexts.push(context);
  const page=await context.newPage();await page.goto(new URL('/sign-in',url).href);
  await page.getByRole('button',{name:new RegExp(`^${name} `)}).click();
  await page.waitForURL('**/browse');await page.getByRole('heading',{level:1}).waitFor();
  return page;
}
async function data(page,path) {
  return page.evaluate(async path=>{const r=await fetch(`/api/${path}`,{cache:'no-store'});if(!r.ok)throw new Error(`Read failed (${r.status})`);return (await r.json()).data;},path);
}
try {
  const a=await account('Alice Martin'),b=await account('Bob Chen'),c=await account('Carol Davis');
  assert.notEqual((await contexts[0].cookies()).find(x=>x.name==='loopswap_demo_session').value,(await contexts[1].cookies()).find(x=>x.name==='loopswap_demo_session').value);
  let id=process.env.LOOPSWAP_E2E_LOOP_ID;
  if(!id) {
    await a.goto(new URL('/matches',url).href);
    await a.getByRole('button',{name:'Review & propose',exact:true}).first().click();
    const dialog=a.getByRole('dialog');await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button',{name:'Accept & propose this loop',exact:true}).click();
    await a.waitForURL('**/loops/*');id=new URL(a.url()).pathname.split('/').at(-1);
    for(const p of[b,c]){await p.goto(new URL(`/loops/${id}`,url).href);await p.getByRole('button',{name:'Accept this exchange',exact:true}).click();}
  }
  let loop=await data(a,`loops/${id}`);assert.equal(loop.state,'CONFIRMED');
  await a.reload();await a.getByText('All items are reserved for this meetup.',{exact:false}).waitFor();
  await a.screenshot({path:'test-results/desktop-confirmed.png',fullPage:true});
  const mobile=await contexts[0].newPage();await mobile.setViewportSize({width:390,height:844});await mobile.goto(new URL('/browse',url).href);await mobile.locator('.listing-grid').waitFor();
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Mobile page should not scroll horizontally');
  await mobile.screenshot({path:'test-results/mobile-browse.png',fullPage:true});
  const keyboard=await contexts[0].newPage();await keyboard.goto(new URL('/browse',url).href);await keyboard.getByRole('heading',{level:1}).waitFor();await keyboard.keyboard.press('Tab');assert.equal(await keyboard.locator(':focus').textContent(),'Skip to content');
  const ready=(await data(a,'bootstrap')).serverTime>=loop.start-600;
  if(!ready){console.error('PARTIAL: three independent browser contexts confirmed and reloaded the exchange; mobile overflow and skip-link checks passed. Receipt journey is UNVERIFIED because the real meetup clock has not opened. Re-run with LOOPSWAP_E2E_LOOP_ID at the agreed time.');process.exitCode=2;}
  else {
    for(const p of[a,b,c]){await p.goto(new URL(`/loops/${id}`,url).href);const current=await data(p,`loops/${id}`);const me=(await data(p,'bootstrap')).actor.id;if(current.transfers.find(t=>t.receiverId===me)?.receipt)continue;await p.getByRole('button',{name:'I received this item',exact:true}).click();await p.getByRole('dialog').getByRole('button',{name:'Yes, I received this item',exact:true}).click();}
    loop=await data(a,`loops/${id}`);assert.equal(loop.state,'COMPLETED');assert.equal(loop.transfers.filter(t=>t.receipt).length,3);
    console.log('PASS A25: three independent browser contexts completed the real receipt journey. A26 manual screen-reader, focus and contrast review is still required.');
  }
} finally {for(const context of contexts)await context.close();await browser.close();}
