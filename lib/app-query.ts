'use client';

import { useSyncExternalStore } from 'react';

const eventName = 'loopswap-querychange';
function subscribe(callback: () => void) {
  window.addEventListener('popstate', callback); window.addEventListener(eventName, callback);
  return () => { window.removeEventListener('popstate', callback); window.removeEventListener(eventName, callback); };
}

export function useAppQuery(): URLSearchParams {
  const query = useSyncExternalStore(subscribe, () => window.location.search, () => '');
  return new URLSearchParams(query);
}

export function queryDestination(current: string, changes: Record<string, string | null>): string {
  const url = new URL(current);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') url.searchParams.delete(key); else url.searchParams.set(key, value);
  }
  return url.pathname + url.search + url.hash;
}

export function browseSearchDestination(current: string, search: string): string {
  const url = new URL(current);
  if (!['/', '/browse'].includes(url.pathname)) { url.search = ''; url.hash = ''; }
  url.pathname = '/browse';
  return queryDestination(url.href, { q: search });
}

export function setAppQuery(changes: Record<string, string | null>): void {
  window.history.replaceState(window.history.state, '', queryDestination(window.location.href, changes));
  window.dispatchEvent(new Event(eventName));
}
