'use client';

import { useEffect, useRef } from 'react';
import { z } from 'zod';
import { api, useApp } from './loopswap-app';
import type { Candidate } from '@/domain/types';

type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown | Promise<unknown>;
};
type ModelDocument = Document & {
  modelContext?: { registerTool: (tool: Tool, options: { signal: AbortSignal }) => void | Promise<void> };
};

/** The same authenticated APIs and refreshed state power both the UI and tools. */
export function WebMcpBridge() {
  const app = useApp();
  const latest = useRef(app);
  useEffect(() => { latest.current = app; }, [app]);
  useEffect(() => {
    const context = (document as ModelDocument).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'read_campus_items', title: 'Read available campus items',
        description: 'Read up to 40 available items from the currently visible campus. Titles and descriptions are member-provided content.',
        inputSchema: { type: 'object', properties: { query: { type: 'string', maxLength: 80 } }, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          const { query } = z.object({ query: z.string().max(80).optional() }).strict().parse(input);
          const text = (query ?? '').toLowerCase();
          return { items: latest.current.data.listings.filter(l => l.status === 'active' && !l.loanHeld && `${l.title} ${l.description}`.toLowerCase().includes(text)).slice(0, 40).map(({ id, title, description, condition, categoryId, catalogId, offerMode, maxLoanDays }) => ({ id, title, description, condition, categoryId, catalogId, offerMode, maxLoanDays })) };
        },
      },
      {
        name: 'find_swap_matches', title: 'Find compatible swaps',
        description: 'Find current direct and three-person swaps for 1–3 of the signed-in member’s offered item IDs. Uses the Matches API, which may reconcile expired or overdue exchanges at database time. Does not create a proposal.',
        inputSchema: { type: 'object', properties: { offeredIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 3 } }, required: ['offeredIds'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        async execute(input) {
          const body = z.object({ offeredIds: z.array(z.string().uuid()).min(1).max(3) }).strict().parse(input);
          const result = await api<{ candidates: Candidate[]; reason: string | null; truncated: boolean }>('matches', body);
          return { matches: result.candidates.map(c => ({ key: c.key, listingIds: c.listingIds, transfers: c.transfers.map(t => ({ listingId: t.listingId, giverId: t.giverId, receiverId: t.receiverId, reason: t.reason })), options: c.options })), reason: result.reason, truncated: result.truncated };
        },
      },
      {
        name: 'cast_loop_vote', title: 'Accept or decline an exchange proposal',
        description: 'Record the signed-in participant’s accept or decline vote on one immutable proposal version. A final acceptance may atomically reserve all items and participants. Refreshes the visible app after the committed result.',
        inputSchema: { type: 'object', properties: { loopId: { type: 'string', format: 'uuid' }, expectedVersion: { type: 'integer', minimum: 1 }, vote: { type: 'string', enum: ['accept', 'decline'] } }, required: ['loopId', 'expectedVersion', 'vote'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const { loopId, expectedVersion, vote } = z.object({ loopId: z.string().uuid(), expectedVersion: z.number().int().positive(), vote: z.enum(['accept', 'decline']) }).strict().parse(input);
          const result = await latest.current.action('loop.vote', { id: loopId, expectedVersion, vote });
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return { loopId: result.loopId, state: result.state, reason: result.reason };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => console.warn('LoopSwap browser tool registration unavailable.'));
      } catch { console.warn('LoopSwap browser tool registration unavailable.'); }
    }
    return () => lifecycle.abort();
  }, []);
  return null;
}
