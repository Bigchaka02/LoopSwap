import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { createSeed, ALICE, BOB, CAROL, MODERATOR, fixtureId } from '../../../domain/seed';
import { lendEnabled, tradeEnabled } from '../../../domain/types';
import { visibleLoan } from '../../../domain/loans';
import { findMatches, sharedOptions } from '../../../domain/matching';
import { DomainError, requireMember, visibleLoop } from '../../../domain/operations';
import { bootstrapDto } from '../../../server/dto';
import { rawDb, readSnapshot, mutate, sha256, reconcileDatabase } from '../../../server/storage';
import { authentication, requireActor, demoEnabled, DEMO_COOKIE, enterDemo } from '../../../server/auth';
import { cleanupUnusedPhotos, getPhoto, uploadPhoto } from '../../../server/photos';
export const dynamic = 'force-dynamic';
const cacheHeaders = { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, oai-authenticated-user-id', 'X-Content-Type-Options': 'nosniff' };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cacheHeaders });
function errorResponse(error: unknown) {
  if (error instanceof DomainError) return json({ error: { code: error.code, message: error.message, retryable: error.status === 503, fields: error.fields } }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: { code: 'VALIDATION', message: 'Check the request details.', retryable: false } }, 400);
  console.error('LoopSwap service error', error instanceof Error ? error.name : 'unknown');
  return json({ error: { code: 'RETRYABLE_DATABASE', message: 'The campus service is temporarily unavailable. Your action has not been confirmed. Please retry.', retryable: true } }, 503);
}
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    if (path.join('/') === 'health') {
      const schema = await rawDb().prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('communities','item_holds','loan_item_holds','participant_holds','active_proposals','loop_events','notification_outbox','demo_sessions','platform_identities','photo_uploads')").first<{ n: number }>();
      return json({ ready: schema?.n === 10, schema: 8, photosReady: !!env.BUCKET }, schema?.n === 10 ? 200 : 503);
    }
    if (path[0] === 'photos' && path.length === 2) return await getPhoto(z.string().uuid().parse(path[1]));
    const auth = await authentication(), actorId = auth.actorId;
    if (path.join('/') === 'bootstrap' && (!actorId || auth.status !== 'active')) {
      const now = Math.floor(Date.now() / 1000), sample = createSeed(now);
      return json({ data: { actor: null, authStatus: auth.status, mode: demoEnabled() ? 'demo' : 'pilot', serverTime: now, categories: sample.categories, catalog: sample.catalog, members: sample.members.map(({ id, name, color }) => ({ id, name, color })), listings: demoEnabled() ? sample.listings : [], loops: [], loans: [], reviews: [], feedbackOpportunities: [], reputations: {}, venueWindows: [], photosEnabled: !!env.BUCKET, notifications: [], problems: [], blockedIds: [], events: [], venues: sample.venues.map(({ id, name, description, accessibility, active }) => ({ id, name, description, accessibility, active })), sample: true }, serverTime: now });
    }
    if (!actorId) throw new DomainError('UNAUTHENTICATED', 'Sign in to continue.', 401);
    const snapshot = await reconcileDatabase();
    if (!snapshot) throw new DomainError('NOT_FOUND', 'The campus is not initialized.', 404);
    requireMember(snapshot.state, actorId);
    const dto = bootstrapDto(snapshot.state, actorId, snapshot.now);
    if (path.join('/') === 'bootstrap') {
      const matchingToken = await sha256(JSON.stringify([snapshot.state.members.map(m => [m.id,m.status,m.version,m.preferenceVersion]),snapshot.state.listings.map(l => [l.id,l.status,l.version]),snapshot.state.venues,snapshot.state.blocks,snapshot.state.loops.map(l => [l.id,l.state,l.start,l.end]),(snapshot.state.loans ?? []).map(l => [l.id,l.state,l.sequence])]));
      return json({ data: { ...dto, matchingToken, authStatus: 'active', photosEnabled: !!env.BUCKET }, serverTime: snapshot.now });
    }
    if (path.join('/') === 'maintenance') {
      if (dto.actor.role !== 'moderator') throw new DomainError('FORBIDDEN', 'Moderator access is required.', 403);
      const uploads = await rawDb().prepare("SELECT count(*) AS n FROM photo_uploads WHERE state IN ('staged','ready','deleting') AND created_at<unixepoch()-86400").first<{ n: number }>();
      return json({ data: { stateBytes: new TextEncoder().encode(JSON.stringify(snapshot.state)).byteLength, ordinaryLimit: 600000, recoveryLimit: 1400000, tradeHolds: snapshot.state.loops.filter(l => ['CONFIRMED','NEEDS_REVIEW'].includes(l.state)).reduce((n,l) => n+l.listingIds.length,0), loanHolds: (snapshot.state.loans ?? []).filter(l => ['RESERVED','ON_LOAN','RETURN_REPORTED','RETURNED','NEEDS_REVIEW'].includes(l.state)).length, reviewCases: [...snapshot.state.loops,...snapshot.state.loans ?? []].filter(l => l.state==='NEEDS_REVIEW').length, photos: !!env.BUCKET, jobSecretConfigured: !!env.LOOPSWAP_JOB_SECRET, unusedUploads: uploads?.n ?? 0 } });
    }
    if (path[0] === 'listings') {
      if (path[1]) {
        const listing = dto.listings.find(l => l.id === path[1]);
        if (!listing) throw new DomainError('NOT_FOUND', 'This item is unavailable.', 404);
        return json({ data: listing, serverTime: snapshot.now });
      }
      const url = new URL(request.url), category = url.searchParams.get('category'), condition = Number(url.searchParams.get('condition') ?? 1), cursor = url.searchParams.get('cursor'), mode = url.searchParams.get('mode');
      if (mode && !['trade','lend'].includes(mode)) throw new DomainError('VALIDATION', 'Choose trade or lend as the listing mode.');
      let listings = dto.listings.filter(l => l.status === 'active' && !l.loanHeld && (!mode || (mode === 'trade' ? tradeEnabled(l) : lendEnabled(l))) && (!category || l.categoryId === category) && l.condition >= condition).sort((a, b) => a.id.localeCompare(b.id));
      if (cursor) listings = listings.filter(l => l.id > cursor);
      return json({ data: listings.slice(0, 20), nextCursor: listings.length > 20 ? listings[19].id : null, serverTime: snapshot.now });
    }
    if (path[0] === 'loans') return json({ data: path[1] ? visibleLoan(snapshot.state, path[1], actorId) : dto.loans, serverTime: snapshot.now });
    if (path[0] === 'loops') return json({ data: path[1] ? visibleLoop(snapshot.state, path[1], actorId) : dto.loops, serverTime: snapshot.now });
    throw new DomainError('NOT_FOUND', 'This endpoint is unavailable.', 404);
  } catch (error) { return errorResponse(error); }
}
async function write(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    if (path.join('/') === 'jobs/reconcile') {
      const secret = (env as unknown as Record<string, string>).LOOPSWAP_JOB_SECRET;
      if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) throw new DomainError('FORBIDDEN', 'Job authentication is required.', 403);
      await reconcileDatabase();
      await rawDb().prepare('DELETE FROM demo_sessions WHERE expires_at<=unixepoch()').run();
      const removedPhotos = await cleanupUnusedPhotos();
      return json({ data: { reconciled: true, removedPhotos } });
    }
    if (request.headers.get('Origin') !== new URL(request.url).origin) throw new DomainError('FORBIDDEN', 'Use the app to submit this action.', 403);
    if (path.join('/') === 'photos') return await uploadPhoto(request);
    if (Number(request.headers.get('Content-Length') ?? 0) > 65536) throw new DomainError('VALIDATION', 'The request is too large.');
    const rawText = await request.text();
    if (new TextEncoder().encode(rawText).byteLength > 65536) throw new DomainError('VALIDATION', 'The request is too large.');
    const body = rawText ? JSON.parse(rawText) : {};
    if (path.join('/') === 'demo/session') {
      if (!demoEnabled()) throw new DomainError('NOT_FOUND', 'Demo sign-in is disabled.', 404);
      const { memberId } = z.object({ memberId: z.enum([ALICE, BOB, CAROL, MODERATOR, fixtureId(4), fixtureId(5)] as [string, ...string[]]) }).strict().parse(body);
      await enterDemo(memberId, request.url.startsWith('https:'));
      return json({ data: { signedIn: true, memberId } });
    }
    if (path.join('/') === 'sign-out') {
      const jar = await cookies(), token = jar.get(DEMO_COOKIE)?.value;
      if (token) await rawDb().prepare('DELETE FROM demo_sessions WHERE token_hash = ?').bind(await sha256(token)).run();
      jar.delete(DEMO_COOKIE); return json({ data: { signedOut: true } });
    }
    const actorId = await requireActor();
    if (path.join('/') === 'matches') {
      const { offeredIds } = z.object({ offeredIds: z.array(z.string().uuid()).min(1).max(3) }).strict().parse(body);
      const snapshot = await reconcileDatabase();
      if (!snapshot) throw new DomainError('NOT_FOUND', 'Campus not initialized.', 404);
      requireMember(snapshot.state, actorId);
      if (offeredIds.some(id => !snapshot!.state.listings.some(l => l.id === id && l.ownerId === actorId))) throw new DomainError('FORBIDDEN', 'Choose your own offered items.', 403);
      return json({ data: findMatches(snapshot.state, actorId, offeredIds, snapshot.now), serverTime: snapshot.now });
    }
    if (path.join('/') === 'loan/options') {
      const { listingId } = z.object({ listingId: z.string().uuid() }).strict().parse(body);
      const snapshot = await reconcileDatabase();
      if (!snapshot) throw new DomainError('NOT_FOUND', 'Campus not initialized.', 404);
      requireMember(snapshot.state, actorId);
      const item = snapshot.state.listings.find(l => l.id === listingId && l.status === 'active' && lendEnabled(l) && l.ownerId !== actorId && snapshot.state.members.some(m => m.id === l.ownerId && m.status === 'active'));
      if (!item || snapshot.state.blocks.some(b => [actorId,item.ownerId].includes(b.blockerId) && [actorId,item.ownerId].includes(b.blockedId))) throw new DomainError('NOT_FOUND', 'This item is unavailable.', 404);
      const dtoItem = bootstrapDto(snapshot.state, actorId, snapshot.now).listings.find(l => l.id === item.id);
      return json({ data: { ...(dtoItem?.loanHeld ? { options: [], reason: 'held' } : sharedOptions(snapshot.state, [actorId,item.ownerId], snapshot.now, 7200, 8)), returnWindows: snapshot.state.venues.filter(v => v.active).flatMap(v => v.windows.filter(w => w.end > snapshot.now && w.start <= snapshot.now + 30 * 86400).map(w => ({ venueId: v.id, ...w }))) }, serverTime: snapshot.now });
    }
    const key = request.headers.get('Idempotency-Key') ?? '';
    if (path.join('/') === 'action') {
      const envelope = z.object({ operation: z.string().max(80), payload: z.unknown() }).strict().parse(body);
      return json(await mutate(actorId, envelope.operation, envelope.payload, key));
    }
    if (path[0] === 'listings') return json(await mutate(actorId, 'listing.save', path[1] ? { ...body, id: path[1] } : body, key));
    if (path[0] === 'loops') {
      const op = !path[1] ? 'loop.propose' : ({ vote: 'loop.vote', cancel: 'loop.cancel', problem: 'loop.problem' } as Record<string, string>)[path[2]];
      if (!op) throw new DomainError('NOT_FOUND', 'This endpoint is unavailable.', 404);
      return json(await mutate(actorId, op, path[1] ? { ...body, id: path[1] } : body, key));
    }
    if (path[0] === 'transfers' && path[2] === 'receipt') {
      const snapshot = await readSnapshot();
      const loop = snapshot?.state.loops.find(l => l.transfers.some(t => t.id === path[1]) && l.participants.some(p => p.userId === actorId));
      if (!loop) throw new DomainError('NOT_FOUND', 'This transfer is unavailable.', 404);
      return json(await mutate(actorId, 'loop.receipt', { ...body, id: loop.id, transferId: path[1] }, key));
    }
    if (path[0] === 'moderation' && path[2] === 'resolve') return json(await mutate(actorId, 'moderation.resolve', { ...body, id: path[1] }, key));
    if (path.join('/') === 'maintenance/photos') {
      const snapshot = await readSnapshot();
      if (!snapshot || requireMember(snapshot.state, actorId).role !== 'moderator') throw new DomainError('FORBIDDEN', 'Moderator access is required.', 403);
      return json({ data: { removedPhotos: await cleanupUnusedPhotos() } });
    }
    throw new DomainError('NOT_FOUND', 'This endpoint is unavailable.', 404);
  } catch (error) { return errorResponse(error); }
}
export const POST = write;
export const PATCH = write;
