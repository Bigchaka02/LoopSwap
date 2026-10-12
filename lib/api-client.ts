type ApiResult = Record<string, unknown>;
const record = (value: unknown): value is ApiResult => !!value && typeof value === 'object' && !Array.isArray(value);

export class ApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number, public readonly confirmedRejection = false, public readonly fields?: Record<string, string>) {
    super(message); this.name = 'ApiError';
  }
}

async function request<T>(path: string, body?: unknown, key?: string, expectedOperationId?: string): Promise<T> {
  const writing = body !== undefined;
  const unconfirmed = writing ? 'Your action has not been confirmed. Retry to check it safely.' : 'The campus service could not load. Reconnect and retry.';
  let response: Response;
  try {
    response = await fetch(`/api/${path}`, {
      method: writing ? 'POST' : 'GET',
      headers: writing ? { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) } : {},
      ...(writing ? { body: JSON.stringify(body) } : {}), cache: 'no-store', credentials: 'same-origin',
    });
  } catch { throw new ApiError(`Connection interrupted. ${unconfirmed}`, 'UNCONFIRMED_RESPONSE'); }
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new ApiError(`The service reply could not be read. ${unconfirmed}`, 'UNCONFIRMED_RESPONSE', response.status); }
  if (!response.ok) {
    const error = record(result) && record(result.error) ? result.error : null;
    const code = typeof error?.code === 'string' ? error.code : 'HTTP_ERROR';
    const definitive = !!error && typeof error.code === 'string' && typeof error.message === 'string'
      && response.status >= 400 && response.status < 500 && ![408, 425].includes(response.status);
    const fields = record(error?.fields) ? Object.fromEntries(Object.entries(error.fields).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : undefined;
    throw new ApiError(typeof error?.message === 'string' ? error.message : unconfirmed, code, response.status, definitive, fields);
  }
  if (!record(result) || !Object.hasOwn(result, 'data')
    || (expectedOperationId && (result.operationId !== expectedOperationId || !record(result.data)))) {
    throw new ApiError(`The service reply was incomplete. ${unconfirmed}`, 'UNCONFIRMED_RESPONSE', response.status);
  }
  return result.data as T;
}

export function api<T = Record<string, unknown>>(path: string, body?: unknown, key?: string): Promise<T> {
  return request<T>(path, body, key);
}

/** Keep uncertain actions retryable; identical in-flight actions share one send. */
export class ActionRequests {
  private readonly pending = new Map<string, { key: string; promise?: Promise<unknown> }>();

  perform<T>(actorId: string, operation: string, payload: unknown): Promise<T> {
    const signature = JSON.stringify([actorId, operation, payload], (_key, value) => record(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
    const entry = this.pending.get(signature) ?? { key: crypto.randomUUID() };
    if (entry.promise) return entry.promise as Promise<T>;
    this.pending.set(signature, entry);
    const promise = request<T>('action', { operation, payload }, entry.key, entry.key).then(result => {
      this.pending.delete(signature); return result;
    }).catch(error => {
      if (error instanceof ApiError && error.confirmedRejection) this.pending.delete(signature);
      throw error;
    }).finally(() => { entry.promise = undefined; });
    entry.promise = promise;
    return promise;
  }
}
