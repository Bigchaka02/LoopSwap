import { DomainError } from '../domain/errors';
import { sanitizePhoto } from './image-validation';

export type Upload = { id: string; owner_id: string; object_key: string; input_hash: string; byte_size: number; width: number; height: number; state: 'staged' | 'ready' | 'deleting' | 'deleted' };
const urlFor = (id: string) => `/api/photos/${id}`;

export async function storePhoto(db: D1Database, bucket: Pick<R2Bucket, 'put' | 'head' | 'delete'>, actorId: string, id: string, inputHash: string, input: Uint8Array) {
  const readUpload = () => db.prepare('SELECT * FROM photo_uploads WHERE id=?').bind(id).first<Upload>();
  const checkClaim = (upload: Upload) => {
    if (upload.owner_id !== actorId) throw new DomainError('NOT_FOUND', 'This upload is unavailable.', 404);
    if (upload.input_hash !== inputHash) throw new DomainError('CONFLICT', 'Choose a new upload request for a different photo.', 409);
    if (['deleting','deleted'].includes(upload.state)) throw new DomainError('CONFLICT', 'This unused upload expired. Choose the photo again.');
  };
  let claim = await readUpload();
  if (claim) {
    checkClaim(claim);
    if (claim.state === 'ready') return { photo: urlFor(id), width: claim.width, height: claim.height };
  }
  const quota = await db.prepare('SELECT count(*) AS n FROM photo_uploads WHERE owner_id=? AND created_at>unixepoch()-86400').bind(actorId).first<{ n: number }>();
  if (!claim && (quota?.n ?? 0) >= 20) throw new DomainError('RATE_LIMITED', 'You can upload up to 20 photos per day. Try again tomorrow.', 429);
  const image = sanitizePhoto(input), objectKey = `photos/${actorId}/${id}.jpg`;
  // Claim the ID/hash before writing the object. Failed uploads remain retryable;
  // GC tombstones prevent a stale request from resurrecting a removed object.
  if (!claim) {
    try {
      await db.prepare('INSERT INTO photo_uploads(id,community_id,owner_id,object_key,input_hash,byte_size,width,height) VALUES(?,\'campus\',?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id, actorId, objectKey, inputHash, image.bytes.length, image.width, image.height).run();
    } catch (error) {
      if (/photo_daily_limit/.test(String(error))) throw new DomainError('RATE_LIMITED', 'You can upload up to 20 photos per day. Try again tomorrow.', 429);
      throw error;
    }
    claim = await readUpload();
    if (!claim) throw new DomainError('RETRYABLE_DATABASE', 'The photo could not be saved. Retry this upload.', 503);
    checkClaim(claim);
  }
  const stored = await bucket.put(objectKey, image.bytes, { onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'image/jpeg' }, customMetadata: { inputHash, ownerId: actorId } });
  if (!stored) {
    const object = await bucket.head(objectKey);
    if (object?.customMetadata?.inputHash !== inputHash) throw new DomainError('CONFLICT', 'This upload request was already used for a different photo.', 409);
  }
  await db.prepare("UPDATE photo_uploads SET state='ready' WHERE id=? AND state='staged'").bind(id).run();
  const ready = await readUpload();
  if (!ready || ready.state !== 'ready') {
    // A GC claim won while this request was in flight. Its tombstone makes
    // deletion safe; a failed object deletion remains durable retry work.
    try { await bucket.delete(objectKey); }
    catch { await db.prepare("UPDATE photo_uploads SET state='deleting' WHERE id=? AND state='deleted'").bind(id).run(); }
    throw new DomainError('CONFLICT', 'This unused upload expired. Choose the photo again.');
  }
  return { photo: urlFor(id), width: ready.width, height: ready.height };
}

/** Claims guard references. Re-sweep tombstones to repair interrupted late PUTs. */
export async function cleanupPhotos(db: D1Database, bucket: Pick<R2Bucket, 'delete'>): Promise<number> {
  const candidates = await db.prepare(`SELECT p.id,p.object_key FROM photo_uploads p
    WHERE p.state='deleting' OR (p.state='deleted' AND p.cleanup_at<unixepoch()-86400) OR (p.state IN ('staged','ready') AND p.created_at<unixepoch()-86400
      AND NOT EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state,'$.listings') i WHERE json_extract(i.value,'$.photo')='/api/photos/'||p.id)
      AND NOT EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state,'$.loops') l JOIN json_each(l.value,'$.transfers') t WHERE json_extract(t.value,'$.item.photo')='/api/photos/'||p.id)
      AND NOT EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state,'$.loans') l WHERE json_extract(l.value,'$.item.photo')='/api/photos/'||p.id))
    ORDER BY p.cleanup_at,p.created_at LIMIT 100`).all<{ id: string; object_key: string }>();
  let removed = 0;
  for (const photo of candidates.results) {
    try {
      const claimed = await db.prepare("UPDATE photo_uploads SET state='deleting',cleanup_at=unixepoch() WHERE id=? AND (state='deleting' OR (state='deleted' AND cleanup_at<unixepoch()-86400) OR (state IN ('staged','ready') AND created_at<unixepoch()-86400)) RETURNING id").bind(photo.id).first();
      if (!claimed) continue;
      await bucket.delete(photo.object_key);
      await db.prepare("UPDATE photo_uploads SET state='deleted' WHERE id=? AND state='deleting'").bind(photo.id).run();
      removed++;
    } catch (error) { if (!/photo_still_referenced/.test(String(error))) throw error; }
  }
  return removed;
}
