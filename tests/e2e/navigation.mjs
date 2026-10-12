import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

// Operator-run gate on an explicitly authorized isolated demo. No server starts.
const base = process.env.LOOPSWAP_E2E_BASE_URL;
if (!base) { console.error('UNVERIFIED: set LOOPSWAP_E2E_BASE_URL to an authorized isolated demo preview.'); process.exit(78); }
const origin = new URL(base);
if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Use an ordinary authorized preview origin.');
let browser;
try { browser = await chromium.launch(); }
catch { console.error('UNVERIFIED: Chromium is unavailable in this environment.'); process.exit(78); }
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
try {
  const page = await context.newPage();
  await page.goto(new URL('/sign-in', origin).href);
  await page.getByRole('button', { name: /^Alice Martin / }).click();
  await page.waitForURL('**/browse');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Your notifications' }).waitFor();
  await page.keyboard.press('Escape');
  for (const [name, mode] of [['Trade to keep', 'trade'], ['Borrow & return', 'lend']]) {
    await page.getByRole('button', { name, exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('mode'), mode);
    await page.reload();
    await page.getByRole('button', { name, exact: true, pressed: true }).waitFor();
  }
  for (const [name, path] of [['Action needed', '/activity'], ['My items', '/listings'], ['Trades', '/loops'], ['Lend & borrow', '/loans'], ['Account', '/settings'], ['Browse', '/browse']]) {
    await page.locator('.main-navigation').getByRole('link', { name: new RegExp(`^${name}`) }).click();
    await page.waitForURL(url => url.pathname === path);
    await page.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await page.locator(`.main-navigation a[href="${path}"]`).getAttribute('aria-current'), 'page');
  }
  await page.locator('.topbar').getByRole('link', { name: 'List an item', exact: true }).click();
  await page.waitForURL('**/listings/new');
  await page.getByRole('heading', { level: 1 }).waitFor();
  await page.goBack(); await page.waitForURL('**/browse');
  await page.getByRole('button', { name: 'Borrow & return', exact: true }).click();
  const search = page.getByRole('textbox', { name: 'Search campus items' });
  await search.fill('bike lock'); await search.press('Enter');
  await page.waitForURL(url => url.pathname === '/browse' && url.searchParams.get('q') === 'bike lock');
  assert.equal(new URL(page.url()).searchParams.get('mode'), 'lend', 'Search should preserve the chosen exchange mode');
  await page.locator('.topbar a.list-button').focus(); await page.keyboard.press('Enter');
  await page.waitForURL('**/listings/new');
  await page.locator('.main-navigation a[href="/browse"]').click(); await page.waitForURL('**/browse');
  const card = page.locator('.item-card').first(), href = await card.getAttribute('href');
  await card.click(); await page.waitForURL(url => url.pathname === href);
  await page.goBack(); await page.waitForURL('**/browse');
  await page.locator('.footer-link[href="/help"]').click(); await page.waitForURL('**/help');
  assert.deepEqual(errors, [], 'Navigation must not raise client-side exceptions');
  console.log('PASS: mouse links, bell, mode persistence, keyboard activation, search, cards, help, and back navigation.');
} finally { await context.close(); await browser.close(); }
