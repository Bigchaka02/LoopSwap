import { Temporal } from '@js-temporal/polyfill';
export function localToUtc(local: string, timezone: string): number {
  const plain = Temporal.PlainDateTime.from(local);
  return Number(plain.toZonedDateTime(timezone, { disambiguation: 'reject' }).epochMilliseconds) / 1000;
}
export function utcToLocal(seconds: number, timezone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(seconds * 1000).toZonedDateTimeISO(timezone).toPlainDateTime().toString({ smallestUnit: 'minute' });
}
