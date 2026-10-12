import { z } from 'zod';
import { fail, parse } from './errors';
import type { FeedbackOpportunity, Review, ReviewRole, State } from './types';

export const QUESTIONS: Record<ReviewRole, { key: string; label: string; weight: number }[]> = {
  trader: [{ key: 'availability', label: 'Did they have the item they agreed to trade?', weight: 40 }, { key: 'condition', label: 'Did the item match its disclosed condition and description?', weight: 40 }, { key: 'commitment', label: 'Did they keep the agreed handoff or communicate changes?', weight: 20 }],
  lender: [{ key: 'availability', label: 'Did they have the item they agreed to lend?', weight: 40 }, { key: 'condition', label: 'Did the item match its disclosed condition and description?', weight: 40 }, { key: 'terms', label: 'Did they follow the agreed loan terms?', weight: 20 }],
  borrower: [{ key: 'returnTiming', label: 'Did they return the item by the agreed time or accepted extension?', weight: 35 }, { key: 'care', label: 'Did they return it in the agreed condition, allowing normal wear?', weight: 35 }, { key: 'disclosure', label: 'Were they honest about any damage, loss, or change?', weight: 20 }, { key: 'coordination', label: 'Did they keep the agreed appointments or communicate changes?', weight: 10 }],
};
function closedAt(state: State, kind: 'trade' | 'loan', id: string) {
  if (kind === 'loan') return state.loans?.find(l => l.id === id)?.closedAt;
  const loop = state.loops.find(l => l.id === id);
  if (!loop || !['COMPLETED', 'RESOLVED'].includes(loop.state)) return;
  return Math.max(...state.events.filter(e => e.loopId === id && ['receipt', 'resolved'].includes(e.kind)).map(e => e.at), ...loop.transfers.map(t => t.receipt?.receivedAt ?? 0));
}
export function feedbackOpportunities(state: State, actorId: string, now: number): FeedbackOpportunity[] {
  const result: FeedbackOpportunity[] = [];
  const add = (kind: 'trade' | 'loan', referenceId: string) => {
    const terminalAt = closedAt(state, kind, referenceId);
    if (!terminalAt || now > terminalAt + 7 * 86400 || (state.reviews ?? []).some(r => r.kind === kind && r.referenceId === referenceId && r.reviewerId === actorId)) return;
    result.push({ kind, referenceId, closesAt: terminalAt + 7 * 86400 });
  };
  for (const loop of state.loops) if (['COMPLETED', 'RESOLVED'].includes(loop.state) && loop.transfers.some(t => t.receiverId === actorId)) add('trade', loop.id);
  for (const loan of state.loans ?? []) if (['CLOSED', 'RESOLVED'].includes(loan.state) && [loan.lenderId, loan.borrowerId].includes(actorId)) add('loan', loan.id);
  return result;
}
export function publishedReview(state: State, review: Review, now: number) {
  if (now >= review.publishAt) return true;
  const same = (state.reviews ?? []).filter(r => r.kind === review.kind && r.referenceId === review.referenceId);
  if (review.kind === 'loan') return same.some(r => r.role === 'lender') && same.some(r => r.role === 'borrower');
  const loop = state.loops.find(l => l.id === review.referenceId);
  return !!loop && loop.transfers.every(t => same.some(r => r.transferId === t.id && r.reviewerId === t.receiverId));
}
export function visibleReview(state: State, id: string, actorId: string) {
  const review = state.reviews?.find(r => r.id === id && ([r.reviewerId, r.subjectId].includes(actorId) || state.members.find(m => m.id === actorId)?.role === 'moderator'));
  if (!review) fail('NOT_FOUND', 'This assessment is unavailable.', 404);
  return review;
}
export function reputationFor(state: State, subjectId: string, now: number) {
  return Object.fromEntries((['trader', 'lender', 'borrower'] as const).map(role => {
    const reviews = (state.reviews ?? []).filter(r => r.subjectId === subjectId && r.role === role && ['submitted', 'supported'].includes(r.status) && publishedReview(state, r, now) && Object.values(r.answers).some(a => a !== 'unknown'));
    const dimensions = QUESTIONS[role].map(q => {
      const assessed = reviews.filter(r => ['yes', 'no'].includes(r.answers[q.key]));
      const positive = assessed.filter(r => r.answers[q.key] === 'yes').length;
      return { key: q.key, count: assessed.length, positive, percent: assessed.length >= 3 ? Math.round(100 * positive / assessed.length) : null };
    });
    const partners = new Set(reviews.map(r => r.reviewerId)).size;
    const sufficient = reviews.length >= 5 && partners >= 3 && dimensions.every(d => d.count >= 3);
    const score = sufficient ? Math.round(dimensions.reduce((s, d, i) => s + (d.positive / d.count) * QUESTIONS[role][i].weight, 0)) : null;
    return [role, { count: reviews.length, partners, score, dimensions }];
  })) as Record<ReviewRole, { count: number; partners: number; score: number | null; dimensions: { key: string; count: number; positive: number; percent: number | null }[] }>;
}
export function applyReviewOperation(state: State, actorId: string, operation: string, input: unknown, now: number) {
  if (operation === 'review.submit') {
    const body = parse(z.object({ kind: z.enum(['trade', 'loan']), referenceId: z.string().uuid(), transferId: z.string().uuid().optional(), answers: z.record(z.enum(['yes', 'no', 'unknown'])), note: z.string().trim().max(500).default('') }).strict(), input);
    const terminalAt = closedAt(state, body.kind, body.referenceId);
    if (!terminalAt || now > terminalAt + 7 * 86400) fail('CONFLICT', 'Feedback opens after closure and remains available for seven days.', 409);
    let role: ReviewRole, subjectId: string;
    if (body.kind === 'trade') {
      const transfer = state.loops.find(l => l.id === body.referenceId)?.transfers.find(t => t.id === body.transferId && t.receiverId === actorId);
      if (!transfer) fail('FORBIDDEN', 'You can assess only the person whose item you were agreed to receive.', 403);
      role = 'trader'; subjectId = transfer.giverId;
      if (!transfer.receipt && body.answers.condition !== 'unknown') fail('VALIDATION', 'Choose “Did not observe” for condition when you did not acknowledge receiving the item.');
    } else {
      const loan = state.loans?.find(l => l.id === body.referenceId && ['CLOSED', 'RESOLVED'].includes(l.state));
      if (!loan || ![loan.lenderId, loan.borrowerId].includes(actorId) || body.transferId) fail('FORBIDDEN', 'Only this loan’s participants can assess each other.', 403);
      role = actorId === loan.borrowerId ? 'lender' : 'borrower'; subjectId = role === 'lender' ? loan.lenderId : loan.borrowerId;
      if ((role === 'lender' && !loan.pickupReceipt && body.answers.condition !== 'unknown') || (role === 'borrower' && ((!loan.returnReceipt || !loan.pickupReceipt) && body.answers.care !== 'unknown' || !loan.pickupReceipt && body.answers.returnTiming !== 'unknown'))) fail('VALIDATION', 'Choose “Did not observe” for condition you did not acknowledge receiving.');
    }
    if (Object.keys(body.answers).length !== QUESTIONS[role].length || QUESTIONS[role].some(q => !Object.hasOwn(body.answers, q.key))) fail('VALIDATION', 'Answer each question for this participant role.');
    state.reviews ??= [];
    if (state.reviews.some(r => r.kind === body.kind && r.referenceId === body.referenceId && r.reviewerId === actorId && r.role === role)) fail('CONFLICT', 'Your assessment is already recorded.', 409);
    const review: Review = { id: crypto.randomUUID(), kind: body.kind, referenceId: body.referenceId, ...(body.transferId ? { transferId: body.transferId } : {}), reviewerId: actorId, subjectId, role, answers: body.answers, note: body.note ?? '', createdAt: now, publishAt: terminalAt + 7 * 86400, status: 'submitted', decisions: [] };
    state.reviews.push(review); return { reviewId: review.id };
  }
  if (operation === 'review.dispute') {
    const body = parse(z.object({ id: z.string().uuid(), reason: z.string().trim().min(10).max(1000) }).strict(), input);
    const review = visibleReview(state, body.id, actorId);
    if (review.subjectId !== actorId || !publishedReview(state, review, now)) fail('FORBIDDEN', 'Only the assessed member can dispute published feedback.', 403);
    if (review.status !== 'submitted' || review.dispute) fail('CONFLICT', 'This assessment already has a dispute or decision.', 409);
    review.dispute = body.reason; review.status = 'disputed'; return { reviewId: review.id };
  }
  if (operation === 'moderation.review.resolve') {
    if (state.members.find(m => m.id === actorId)?.role !== 'moderator') fail('FORBIDDEN', 'Moderator access is required.', 403);
    const body = parse(z.object({ id: z.string().uuid(), expectedDecisions: z.number().int().nonnegative(), outcome: z.enum(['supported', 'excluded']), reason: z.string().trim().min(10).max(1000) }).strict(), input);
    const review = visibleReview(state, body.id, actorId);
    if (review.status !== 'disputed' || review.decisions.length !== body.expectedDecisions) fail('CONFLICT', 'Reload the latest disputed assessment first.', 409);
    review.status = body.outcome; review.decisions.push({ at: now, moderatorId: actorId, status: body.outcome, reason: body.reason }); return { reviewId: review.id };
  }
  fail('VALIDATION', 'This feedback operation is unavailable.');
}
