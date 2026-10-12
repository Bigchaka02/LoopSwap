import { describe, expect, it } from 'vitest';
import { returnFits, suggestedReturn } from '../../lib/loan-plan';
const pickup = { venueId: 'library', start: 90000, end: 91800 };
describe('return appointment suggestions', () => {
  it('finds approved hours after a closed next day, within the original maximum', () => {
    const hours = [{ venueId: 'library', start: pickup.start+2*86400, end: pickup.end+2*86400 }];
    expect(suggestedReturn(pickup,3,hours)).toEqual({venueId:'library',start:hours[0].start,end:hours[0].end});
    expect(suggestedReturn(pickup,1,hours)).toBeNull();
  });
  it('allows exactly one day and rejects partial opening coverage or excess duration', () => {
    const slot = {...pickup,start:pickup.start+86400,end:pickup.end+86400};
    expect(returnFits(slot,pickup,1,[slot])).toBe(true);
    expect(returnFits(slot,pickup,1,[{...slot,end:slot.end-900}])).toBe(false);
    expect(returnFits({...slot,start:slot.start+900,end:slot.end+900},pickup,1,[{...slot,end:slot.end+900}])).toBe(false);
  });
});
