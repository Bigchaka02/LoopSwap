import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { DomainError, requireMember } from '../domain/operations';
import type { State } from '../domain/types';
import { requireActor } from './auth';
import { bootstrapDto } from './dto';
import { rawDb, readSnapshot } from './storage';
import { readBoundedPhoto } from './photo-body';
import { cleanupPhotos, storePhoto, type Upload } from './photo-storage';

const headers = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, oai-authenticated-user-id', 'X-Content-Type-Options': 'nosniff' };
const urlFor = (id: string) => `/api/photos/${id}`;

export async function uploadPhoto(request: Request): Promise<Response> {
  if (!env.BUCKET) throw new DomainError('RETRYABLE_DATABASE', 'Photo storage is temporarily unavailable. You can still save an item without a photo.', 503);
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'image/jpeg') throw new DomainError('VALIDATION', 'Use the listing photo editor to prepare this image.');
  const actorId = await requireActor(), snapshot = await readSnapshot();
  if (!snapshot) throw new DomainError('NOT_FOUND', 'The campus is unavailable.', 404);
  requireMember(snapshot.state, actorId);
  const id = z.string().uuid().parse(request.headers.get('Idempotency-Key'));
  const input = await readBoundedPhoto(request), inputHash = await sha256Bytes(input);
  const saved = await storePhoto(rawDb(), env.BUCKET, actorId, id, inputHash, input);
  return Response.json({ data: saved }, { headers });
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function validateListingPhoto(state: State, actorId: string, input: unknown): Promise<void> {
  if (!input || typeof input !== 'object' || !('photo' in input) || input.photo === null) return;
  const body = input as { id?: unknown; photo?: unknown };
  const current = state.listings.find(l => l.id === body.id && l.ownerId === actorId);
  if (current?.photo === body.photo) return;
  const photo = z.string().regex(/^\/api\/photos\/[0-9a-f-]{36}$/i).parse(body.photo);
  const upload = await rawDb().prepare("SELECT * FROM photo_uploads WHERE id=? AND owner_id=? AND state='ready'").bind(photo.slice('/api/photos/'.length), actorId).first<Upload>();
  if (!upload || !env.BUCKET || !await env.BUCKET.head(upload.object_key)) throw new DomainError('VALIDATION', 'Upload your own photo before attaching it to this item.');
}

export async function getPhoto(id: string): Promise<Response> {
  const actorId = await requireActor(), snapshot = await readSnapshot();
  if (!snapshot) throw new DomainError('NOT_FOUND', 'This photo is unavailable.', 404);
  const actor = requireMember(snapshot.state, actorId), upload = await rawDb().prepare('SELECT * FROM photo_uploads WHERE id=?').bind(id).first<Upload>();
  const photo = urlFor(id), dto = bootstrapDto(snapshot.state, actorId, snapshot.now);
  const visible = upload?.state === 'ready' && (upload.owner_id === actorId || actor.role === 'moderator'
    || dto.listings.some(l => l.photo === photo)
    || dto.loops.some(l => l.transfers.some(t => t.item.photo === photo))
    || dto.loans.some(l => l.item.photo === photo));
  if (!visible || !env.BUCKET) throw new DomainError('NOT_FOUND', 'This photo is unavailable.', 404);
  const object = await env.BUCKET.get(upload.object_key);
  if (!object) throw new DomainError('NOT_FOUND', 'This photo is unavailable.', 404);
  return new Response(object.body, { headers: { ...headers, 'Content-Type': 'image/jpeg', 'Content-Length': String(object.size), 'Content-Disposition': 'inline; filename="item-photo.jpg"' } });
}

export async function cleanupUnusedPhotos(): Promise<number> {
  return env.BUCKET ? cleanupPhotos(rawDb(), env.BUCKET) : 0;
}
