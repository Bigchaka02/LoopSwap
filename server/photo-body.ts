import { DomainError } from '../domain/errors';
import { PHOTO_BYTES } from './image-validation';

export async function readBoundedPhoto(request: Request): Promise<Uint8Array> {
  if (Number(request.headers.get('Content-Length') ?? 0) > PHOTO_BYTES || !request.body) throw new DomainError('VALIDATION', 'The photo is too large or empty.');
  const reader = request.body.getReader(), bytes = new Uint8Array(PHOTO_BYTES);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      if (size + value.byteLength > PHOTO_BYTES) { await reader.cancel(); throw new DomainError('VALIDATION', 'The photo is too large.'); }
      bytes.set(value, size); size += value.byteLength;
    }
  } finally { reader.releaseLock(); }
  return bytes.subarray(0, size);
}

