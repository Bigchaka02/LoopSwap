import type { MatchOption } from '../domain/types';

export type ReturnWindow = { venueId: string; start: number; end: number };

export function returnFits(slot: MatchOption, pickup: MatchOption, maxDays: number, hours: ReturnWindow[]): boolean {
  return slot.start % 900 === 0 && slot.end === slot.start + 1800
    && slot.start >= pickup.start + 86400 && slot.end <= pickup.end + maxDays * 86400
    && hours.some(w => w.venueId === slot.venueId && w.start <= slot.start && w.end >= slot.end);
}

/** Suggest an actually open return window, rather than assuming tomorrow opens. */
export function suggestedReturn(pickup: MatchOption, maxDays: number, hours: ReturnWindow[]): MatchOption | null {
  const options = hours.flatMap(w => {
    const start = Math.ceil(Math.max(w.start, pickup.start + 86400) / 900) * 900;
    const slot = { venueId: w.venueId, start, end: start + 1800 };
    return returnFits(slot, pickup, maxDays, hours) ? [slot] : [];
  });
  return options.sort((a, b) => Number(b.venueId === pickup.venueId) - Number(a.venueId === pickup.venueId) || a.start - b.start || a.venueId.localeCompare(b.venueId))[0] ?? null;
}
