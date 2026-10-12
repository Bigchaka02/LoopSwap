import { afterEach, describe, expect, it } from 'vitest';
import { ALICE, BOB } from '../../domain/seed';
import type { Listing } from '../../domain/types';
import { makeDatabase, proposeMain } from '../helpers';
const databases: ReturnType<typeof makeDatabase>[] = [];
afterEach(() => databases.splice(0).forEach(d => d.close()));
const setup = () => { const d=makeDatabase(); databases.push(d); return d; };
function stage(d: ReturnType<typeof makeDatabase>, owner=ALICE) {
  const id=crypto.randomUUID();
  d.db.prepare("INSERT INTO photo_uploads(id,community_id,owner_id,object_key,input_hash,byte_size,width,height) VALUES(?,'campus',?,?,?,100,2,2)").run(id,owner,`photos/${owner}/${id}.jpg`,'hash');
  return id;
}
function save(d: ReturnType<typeof makeDatabase>, listing: Listing, photo: string | null) {
  return d.act(listing.ownerId,'listing.save',{id:listing.id,expectedVersion:listing.version,title:listing.title,description:listing.description,categoryId:listing.categoryId,catalogId:listing.catalogId,condition:listing.condition,wants:listing.wants.map(({id,mode,categoryId,catalogId,minCondition,priority})=>({id,mode,...(categoryId?{categoryId}:{}),...(catalogId?{catalogId}:{}),minCondition,priority})),photo,photoAlt:'Item with honestly shown wear',publish:true,ownershipConfirmed:true});
}
describe('durable photo ownership and cleanup claims', () => {
  it('rejects staged and foreign-owner photos and accepts a ready owned photo', () => {
    const d=setup(), item=d.snapshot().state.listings[0], own=stage(d), foreign=stage(d,BOB);
    expect(()=>save(d,item,`/api/photos/${own}`)).toThrow('photo_reference_invalid');
    for(const id of [own,foreign])d.db.prepare("UPDATE photo_uploads SET state='ready' WHERE id=?").run(id);
    expect(()=>save(d,item,`/api/photos/${foreign}`)).toThrow('photo_reference_invalid');
    save(d,item,`/api/photos/${own}`);
    expect(d.snapshot().state.listings[0].photo).toBe(`/api/photos/${own}`);
  });
  it('keeps photos in immutable proposal snapshots after the listing changes', () => {
    const d=setup(), id=stage(d);d.db.prepare("UPDATE photo_uploads SET state='ready' WHERE id=?").run(id);
    save(d,d.snapshot().state.listings[0],`/api/photos/${id}`);const loop=proposeMain(d);
    save(d,d.snapshot().state.listings[0],null);
    expect(d.snapshot().state.loops.find(l=>l.id===loop)?.transfers[0].item.photo).toBe(`/api/photos/${id}`);
    expect(()=>d.db.prepare("UPDATE photo_uploads SET state='deleting' WHERE id=?").run(id)).toThrow('photo_still_referenced');
  });
  it('prevents cleanup of attached photos and prevents tombstone resurrection', () => {
    const d=setup(), kept=stage(d), unused=stage(d);for(const id of[kept,unused])d.db.prepare("UPDATE photo_uploads SET state='ready' WHERE id=?").run(id);
    save(d,d.snapshot().state.listings[0],`/api/photos/${kept}`);
    expect(()=>d.db.prepare("UPDATE photo_uploads SET state='deleting' WHERE id=?").run(kept)).toThrow('photo_still_referenced');
    d.db.prepare("UPDATE photo_uploads SET state='deleting' WHERE id=?").run(unused);d.db.prepare("UPDATE photo_uploads SET state='deleted' WHERE id=?").run(unused);
    expect(()=>d.db.prepare("UPDATE photo_uploads SET state='ready' WHERE id=?").run(unused)).toThrow('photo_upload_immutable');
    expect(()=>save(d,d.snapshot().state.listings[0],`/api/photos/${unused}`)).toThrow('photo_reference_invalid');
    expect(()=>d.db.prepare('DELETE FROM photo_uploads WHERE id=?').run(unused)).toThrow('photo_tombstone_required');
  });
  it('enforces an atomic rolling daily upload limit while allowing same-ID retries', () => {
    const d=setup();for(let n=0;n<20;n++)stage(d);
    expect(()=>stage(d)).toThrow('photo_daily_limit');
    const row=d.db.prepare('SELECT * FROM photo_uploads LIMIT 1').get()!;
    expect(()=>d.db.prepare('INSERT INTO photo_uploads(id,community_id,owner_id,object_key,input_hash,byte_size,width,height) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').run(row.id as string,row.community_id as string,row.owner_id as string,row.object_key as string,row.input_hash as string,100,2,2)).not.toThrow();
    d.clock.now+=86401;expect(()=>stage(d)).not.toThrow();
  });
});
