import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppLink from '../../components/app-link';
import { appDestination } from '../../lib/app-navigation';
import { browseSearchDestination, queryDestination } from '../../lib/app-query';

describe('browser-owned app navigation', () => {
  it('renders navigation destinations as native anchors with accessible names', () => {
    for (const [href, name] of [['/listings/new','List an item'],['/listings','My items'],['/loops','Trades'],['/loans','Lend & borrow'],['/settings','Account'],['/help','Help & safety']]) {
      const html = renderToStaticMarkup(createElement(AppLink, { href, 'aria-label': name }, name));
      expect(html).toBe(`<a href="${href}" aria-label="${name.replace('&', '&amp;')}">${name.replace('&', '&amp;')}</a>`);
    }
  });
  it('preserves new-tab, download and page-current link semantics', () => {
    const html = renderToStaticMarkup(createElement(AppLink, { href: '/browse?mode=lend', target: '_blank', rel: 'noopener', download: 'items.json', 'aria-current': 'page' }, 'Open'));
    expect(html).toContain('target="_blank"'); expect(html).toContain('download="items.json"'); expect(html).toContain('aria-current="page"');
  });
  it('keeps redirects local while preserving route queries and hashes', () => {
    expect(appDestination('/browse?q=bike%20lock&mode=lend#items', 'https://campus.test/settings')).toBe('https://campus.test/browse?q=bike%20lock&mode=lend#items');
    for (const href of ['javascript:alert(1)','https://other.test/items','//other.test/items','data:text/html,hello']) expect(() => appDestination(href,'https://campus.test/browse')).toThrow('within this campus app');
  });
  it('preserves search when filters change and removes cleared filters', () => {
    const href = queryDestination('https://campus.test/browse?q=lock&category=tools#items', { mode: 'lend', category: null });
    expect(href).toBe('/browse?q=lock&mode=lend#items');
    expect(queryDestination('https://campus.test'+href, { q: '', mode: null })).toBe('/browse#items');
  });
  it('keeps browse filters on search submission and drops unrelated route parameters', () => {
    expect(browseSearchDestination('https://campus.test/browse?mode=lend&category=tools&condition=2&sort=title#items', 'bike lock')).toBe('/browse?mode=lend&category=tools&condition=2&sort=title&q=bike+lock#items');
    expect(browseSearchDestination('https://campus.test/settings?tab=privacy#account', 'lock')).toBe('/browse?q=lock');
    expect(browseSearchDestination('https://campus.test/browse?mode=trade&q=lock', '')).toBe('/browse?mode=trade');
  });
});
