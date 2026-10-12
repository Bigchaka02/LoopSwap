import { cookies } from 'next/headers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { DomainError } from '../domain/operations';
import { ALICE, BOB, CAROL, MODERATOR, fixtureId } from '../domain/seed';
import { appMode, initializeDemo, rawDb, readSnapshot, sha256 } from './storage';
export const DEMO_MEMBERS = [ALICE, BOB, CAROL, fixtureId(4), fixtureId(5), MODERATOR];
export const DEMO_COOKIE = 'loopswap_demo_session';
const COOKIE = DEMO_COOKIE;
export const demoEnabled = () => appMode() === 'demo';
export type AuthStatus = 'anonymous' | 'active' | 'awaiting_membership' | 'suspended' | 'left';
export async function authentication(): Promise<{ actorId: string | null; status: AuthStatus }> {
  const snapshot = await readSnapshot();
  let actorId: string | null = null;
  if (appMode() === 'demo') {
    if (!snapshot || snapshot.state.mode !== 'demo') return { actorId: null, status: 'anonymous' };
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token) return { actorId: null, status: 'anonymous' };
    const session = await rawDb().prepare("SELECT member_id FROM demo_sessions WHERE token_hash=? AND community_id='campus' AND expires_at>unixepoch()").bind(await sha256(token)).first<{ member_id: string }>();
    actorId = session?.member_id ?? null;
    if (!actorId) return { actorId: null, status: 'anonymous' };
  } else {
    const identity = await getChatGPTUser();
    if (!identity) return { actorId: null, status: 'anonymous' };
    const row = await rawDb().prepare("SELECT member_id FROM platform_identities WHERE platform_id=? AND community_id='campus'").bind(identity.userId).first<{ member_id: string }>();
    actorId = row?.member_id ?? null;
    if (!actorId || !snapshot) return { actorId: null, status: 'awaiting_membership' };
  }
  const member = snapshot?.state.members.find(m => m.id === actorId);
  return { actorId, status: member?.status === 'active' ? 'active' : member?.status === 'suspended' ? 'suspended' : member?.status === 'left' ? 'left' : 'awaiting_membership' };
}
export async function authenticatedActor(): Promise<string | null> {
  return (await authentication()).actorId;
}
export async function requireActor(): Promise<string> {
  const actor = await authenticatedActor();
  if (!actor) throw new DomainError('UNAUTHENTICATED', 'Sign in to your campus account to continue.', 401);
  return actor;
}
export async function enterDemo(memberId: string, secure: boolean) {
  if (appMode() !== 'demo' || !DEMO_MEMBERS.includes(memberId)) throw new DomainError('NOT_FOUND', 'This demo account is unavailable.', 404);
  await initializeDemo(); const snapshot = await readSnapshot();
  if (snapshot?.state.mode !== 'demo' || !snapshot.state.members.some(m => m.id === memberId && m.status === 'active')) throw new DomainError('FORBIDDEN', 'This demo membership is unavailable.', 403);
  const token = crypto.randomUUID() + crypto.randomUUID();
  await rawDb().prepare("INSERT INTO demo_sessions(token_hash,member_id,community_id,expires_at) VALUES(?,?,'campus',unixepoch()+28800)").bind(await sha256(token), memberId).run();
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure, sameSite: 'strict', path: '/', maxAge: 28800 });
}
export async function signOut() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (token) await rawDb().prepare('DELETE FROM demo_sessions WHERE token_hash=?').bind(await sha256(token)).run();
  (await cookies()).delete(COOKIE);
}
