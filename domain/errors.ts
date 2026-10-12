import { z } from 'zod';
export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400, public fields?: Record<string, string>) { super(message); }
}
export function fail(code: string, message: string, status = 400): never { throw new DomainError(code, message, status); }
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('VALIDATION', 'Please check the highlighted details.', 400, Object.fromEntries(result.error.issues.map(i => [i.path.join('.'), i.message])));
  return result.data;
}
