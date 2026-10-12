import { afterEach, describe, expect, it } from 'vitest';
import jpeg from 'jpeg-js';
import { ALICE, createSeed } from '../../domain/seed';
import { readBoundedPhoto } from '../../server/photo-body';
import { cleanupPhotos, storePhoto } from '../../server/photo-storage';
import { FIXED_NOW, makeDatabase } from '../helpers';

const databases: ReturnType<typeof makeDatabase>[] = [];
afterEach(() => databases.splice(0).forEach(d => d.close()));
const input = new Uint8Array(jpeg.encode({ width: 2, height: 2, data: new Uint8Array(16).fill(255) }, 80).data);
type Value = string | number | null | Uint8Array;
function adapter(d: ReturnType<typeof makeDatabase>, beforeRun?: (sql: string) => void): D1Database {
  return { prepare(sql: string) {
    let values: Value[] = [];
    const statement = {
      bind(...args: Value[]) { values = args; return statement; },
      async first() { return d.db.prepare(sql).get(...values) ?? null; },
      async all() { return { results: d.db.prepare(sql).all(...values) }; },
      async run() { beforeRun?.(sql); return d.db.prepare(sql).run(...values); },
    };
    return statement;
  } } as unknown as D1Database;
}
class Bucket {
  objects = new Map<string, { bytes: Uint8Array; customMetadata: Record<string, string> }>();
  beforePut?: () => Promise<void>;
  afterPut?: () => Promise<void>;
  failDelete = false;
  async put(key: string, bytes: Uint8Array, options: { customMetadata: Record<string, string> }) {
    await this.beforePut?.();
    if (this.objects.has(key)) return null;
    this.objects.set(key, { bytes, customMetadata: options.customMetadata });
    await this.afterPut?.();
    return {} as R2Object;
  }
  async head(key: string) { return (this.objects.get(key) ?? null) as unknown as R2Object | null; }
  async delete(key: string) { if (this.failDelete) throw new Error('temporary R2 deletion failure'); this.objects.delete(key); }
  get binding() { return this as unknown as Pick<R2Bucket, 'put' | 'head' | 'delete'>; }
}
function setup(initial?: Parameters<typeof makeDatabase>[1]) {
  const d = makeDatabase(':memory:', initial); databases.push(d);
  return { d, db: adapter(d), bucket: new Bucket() };
}
const stateOf = (d: ReturnType<typeof makeDatabase>, id: string) => d.db.prepare('SELECT state FROM photo_uploads WHERE id=?').get(id)?.state;

describe('photo resource coordination with real SQL guards', () => {
  it('keeps a concurrent retry winner when another ready write fails', async () => {
    const { d, bucket } = setup(), id = crypto.randomUUID();
    let failOnce = true;
    const db = adapter(d, sql => { if (sql.includes("SET state='ready'") && failOnce) { failOnce = false; throw new Error('ambiguous D1 write'); } });
    const results = await Promise.allSettled([1, 2].map(() => storePhoto(db, bucket.binding, ALICE, id, 'same-hash', input)));
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(stateOf(d, id)).toBe('ready'); expect(bucket.objects.size).toBe(1);
    await expect(storePhoto(db, bucket.binding, ALICE, id, 'same-hash', input)).resolves.toMatchObject({ photo: `/api/photos/${id}` });
    await expect(storePhoto(db, bucket.binding, ALICE, id, 'different-hash', input)).rejects.toThrow('different photo');
    expect(bucket.objects.size).toBe(1);
  });
  it('retains a staged upload through a transient write failure so Retry can finish', async () => {
    const { d, bucket } = setup(), id = crypto.randomUUID();
    const failed = adapter(d, sql => { if (sql.includes("SET state='ready'")) throw new Error('D1 unavailable'); });
    await expect(storePhoto(failed, bucket.binding, ALICE, id, 'hash', input)).rejects.toThrow('D1 unavailable');
    expect(stateOf(d, id)).toBe('staged'); expect(bucket.objects.size).toBe(1);
    await storePhoto(adapter(d), bucket.binding, ALICE, id, 'hash', input);
    expect(stateOf(d, id)).toBe('ready'); expect(bucket.objects.size).toBe(1);
  });
  it('does not resurrect an upload cleaned between object write and finalization', async () => {
    const { d, db, bucket } = setup(), id = crypto.randomUUID();
    bucket.afterPut = async () => { d.clock.now += 86401; expect(await cleanupPhotos(db, bucket.binding)).toBe(1); };
    await expect(storePhoto(db, bucket.binding, ALICE, id, 'hash', input)).rejects.toThrow('expired');
    expect(stateOf(d, id)).toBe('deleted'); expect(bucket.objects.size).toBe(0);
    await expect(storePhoto(db, bucket.binding, ALICE, id, 'hash', input)).rejects.toThrow('expired');
  });
  it('requeues a late object when cleanup won before PUT and its deletion fails', async () => {
    const { d, db, bucket } = setup(), id = crypto.randomUUID();
    bucket.beforePut = async () => { d.clock.now += 86401; await cleanupPhotos(db, bucket.binding); bucket.failDelete = true; };
    await expect(storePhoto(db, bucket.binding, ALICE, id, 'hash', input)).rejects.toThrow('expired');
    expect(stateOf(d, id)).toBe('deleting'); expect(bucket.objects.size).toBe(1);
    bucket.failDelete = false;
    expect(await cleanupPhotos(db, bucket.binding)).toBe(1);
    expect(stateOf(d, id)).toBe('deleted'); expect(bucket.objects.size).toBe(0);
  });
  it('keeps deletion work durable after an R2 failure and retries it', async () => {
    const { d, db, bucket } = setup(), id = crypto.randomUUID();
    await storePhoto(db, bucket.binding, ALICE, id, 'hash', input); d.clock.now += 86401; bucket.failDelete = true;
    await expect(cleanupPhotos(db, bucket.binding)).rejects.toThrow('R2 deletion failure');
    expect(stateOf(d, id)).toBe('deleting'); expect(bucket.objects.size).toBe(1);
    bucket.failDelete = false; expect(await cleanupPhotos(db, bucket.binding)).toBe(1);
    expect(stateOf(d, id)).toBe('deleted'); expect(bucket.objects.size).toBe(0);
  });
  it('re-sweeps a tombstone after an interrupted late PUT finalization', async () => {
    const { d, db, bucket } = setup(), id = crypto.randomUUID();
    bucket.beforePut = async () => { d.clock.now += 86401; await cleanupPhotos(db, bucket.binding); };
    const interrupted = adapter(d, sql => { if (sql.includes("SET state='ready'")) throw new Error('finalization interrupted'); });
    await expect(storePhoto(interrupted, bucket.binding, ALICE, id, 'hash', input)).rejects.toThrow('finalization interrupted');
    expect(stateOf(d, id)).toBe('deleted'); expect(bucket.objects.size).toBe(1);
    expect(await cleanupPhotos(db, bucket.binding)).toBe(0);
    d.clock.now += 86401; expect(await cleanupPhotos(db, bucket.binding)).toBe(1);
    expect(stateOf(d, id)).toBe('deleted'); expect(bucket.objects.size).toBe(0);
  });
  it('finds unused photos after more than 100 older retained references', async () => {
    const seed = createSeed(FIXED_NOW), ids = Array.from({ length: 101 }, () => crypto.randomUUID());
    const template = seed.listings[0];
    seed.listings.push(...ids.map(id => ({ ...structuredClone(template), id: crypto.randomUUID(), status: 'draft' as const, photo: `/api/photos/${id}` })));
    const { d, db, bucket } = setup(seed);
    for (const [index, id] of ids.entries()) {
      if (index && index % 20 === 0) d.clock.now += 86401;
      await storePhoto(db, bucket.binding, ALICE, id, 'hash', input);
    }
    const orphan = crypto.randomUUID(); await storePhoto(db, bucket.binding, ALICE, orphan, 'hash', input); d.clock.now += 86401;
    expect(await cleanupPhotos(db, bucket.binding)).toBe(1);
    expect(stateOf(d, orphan)).toBe('deleted'); expect(bucket.objects.size).toBe(101);
    expect(ids.every(id => stateOf(d, id) === 'ready')).toBe(true);
  });
  it('cancels a streamed oversized body even without Content-Length', async () => {
    let cancelled = false, count = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(count++ ? 300001 : 700000)); }, cancel() { cancelled = true; } });
    const request = new Request('https://loopswap.test/api/photos', { method: 'POST', body, duplex: 'half' } as RequestInit & { duplex: 'half' });
    await expect(readBoundedPhoto(request)).rejects.toThrow('too large'); expect(cancelled).toBe(true);
  });
});
