import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionRequests, ApiError, api } from '../../lib/api-client';

afterEach(() => vi.unstubAllGlobals());
const keyOf = (init?: RequestInit) => new Headers(init?.headers).get('Idempotency-Key')!;
const accepted = (init?: RequestInit) => Response.json({ data: { listingId: 'saved-item' }, operationId: keyOf(init) });
const rejection = () => Response.json({ error: { code: 'VALIDATION', message: 'Check the title.', fields: { title: 'Too short' } } }, { status: 400 });

describe('API reply and retry contracts', () => {
  it('keeps legitimate falsy data and private request settings', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: false })); vi.stubGlobal('fetch', fetcher);
    expect(await api('bootstrap')).toBe(false);
    expect(fetcher).toHaveBeenCalledWith('/api/bootstrap', expect.objectContaining({ method: 'GET', cache: 'no-store', credentials: 'same-origin' }));
  });
  it('preserves structured field errors as confirmed rejections', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => rejection()));
    await expect(api('action', {})).rejects.toMatchObject({ code: 'VALIDATION', status: 400, confirmedRejection: true, fields: { title: 'Too short' }, message: 'Check the title.' });
  });
  it('gives readable errors for interrupted or non-JSON replies', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(new Response('<html>upstream failure</html>', { status: 502 }));
    vi.stubGlobal('fetch', fetcher);
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(api('action', {})).rejects.toMatchObject({ code: 'UNCONFIRMED_RESPONSE', confirmedRejection: false, message: expect.stringContaining('not been confirmed') });
    }
  });
  it('keeps the original key after incomplete or mismatched success replies', async () => {
    for (const reply of [undefined, null, 'missing-ack', 'wrong-ack', 'html']) {
      const keys: string[] = [], queue = new ActionRequests(); let first = true;
      vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
        keys.push(keyOf(init));
        if (!first) return accepted(init); first = false;
        if (reply === 'html') return new Response('<html>unknown result</html>');
        if (reply === undefined) return Response.json({});
        if (reply === null) return Response.json({ data: null, operationId: keyOf(init) });
        return Response.json({ data: { listingId: 'saved-item' }, ...(reply === 'wrong-ack' ? { operationId: crypto.randomUUID() } : {}) });
      }));
      await expect(queue.perform('alice', 'listing.save', { title: 'A lock' })).rejects.toBeInstanceOf(ApiError);
      expect(await queue.perform('alice', 'listing.save', { title: 'A lock' })).toEqual({ listingId: 'saved-item' });
      expect(keys[0]).toBe(keys[1]);
    }
  });
  it('retains the key for network failures, timeout errors, and uncertain HTTP failures', async () => {
    for (const failure of ['network', 408, 503, 403] as const) {
      const keys: string[] = [], queue = new ActionRequests(); let first = true;
      vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
        keys.push(keyOf(init)); if (!first) return accepted(init); first = false;
        if (failure === 'network') throw new TypeError('reply lost');
        if (failure === 403) return new Response('unknown upstream rejection', { status: 403 });
        return Response.json({ error: { code: 'RETRYABLE_DATABASE', message: 'Please retry.' } }, { status: failure });
      }));
      await expect(queue.perform('alice', 'listing.save', { title: 'A lock' })).rejects.toBeInstanceOf(ApiError);
      await queue.perform('alice', 'listing.save', { title: 'A lock' }); expect(keys[0]).toBe(keys[1]);
    }
  });
  it('sends identical concurrent actions only once', async () => {
    let resolveReply!: (reply: Response) => void, captured: RequestInit | undefined;
    const fetcher = vi.fn((_path: string, init?: RequestInit) => { captured = init; return new Promise<Response>(resolve => { resolveReply = resolve; }); });
    vi.stubGlobal('fetch', fetcher); const queue = new ActionRequests();
    const one = queue.perform('alice', 'listing.save', { title: 'A lock', description: 'Two keys' }), two = queue.perform('alice', 'listing.save', { description: 'Two keys', title: 'A lock' });
    expect(fetcher).toHaveBeenCalledTimes(1); resolveReply(accepted(captured));
    expect(await Promise.all([one, two])).toEqual([{ listingId: 'saved-item' }, { listingId: 'saved-item' }]);
  });
  it('clears keys after definite rejection or acknowledged success', async () => {
    const keys: string[] = []; let first = true;
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => { keys.push(keyOf(init)); if (first) { first = false; return rejection(); } return accepted(init); }));
    const queue = new ActionRequests();
    await expect(queue.perform('alice', 'listing.save', { title: 'A lock' })).rejects.toBeInstanceOf(ApiError);
    await queue.perform('alice', 'listing.save', { title: 'A lock' }); await queue.perform('alice', 'listing.save', { title: 'A lock' });
    expect(new Set(keys).size).toBe(3);
  });
  it('uses distinct keys for different payloads and members', async () => {
    const keys: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => { keys.push(keyOf(init)); throw new TypeError('reply lost'); }));
    const queue = new ActionRequests();
    for (const [actor, title] of [['alice', 'A lock'], ['alice', 'A textbook'], ['bob', 'A lock']]) {
      await expect(queue.perform(actor, 'listing.save', { title })).rejects.toBeInstanceOf(ApiError);
    }
    expect(new Set(keys).size).toBe(3);
  });
});
