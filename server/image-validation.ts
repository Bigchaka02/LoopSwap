import jpeg from 'jpeg-js';
import { DomainError } from '../domain/errors';

export const PHOTO_BYTES = 1_000_000;
export const PHOTO_EDGE = 900;

/** Decode bounded pixels and re-encode only pixels; never retain EXIF/comments. */
export function sanitizePhoto(input: Uint8Array) {
  if (!input.length || input.length > PHOTO_BYTES || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new DomainError('VALIDATION', 'Choose a JPEG photo under 1 MB. The editor prepares ordinary JPG, PNG, and WebP photos for you.');
  }
  try {
    const decoded = jpeg.decode(input, { useTArray: true, formatAsRGBA: true, tolerantDecoding: false, maxResolutionInMP: 0.81, maxMemoryUsageInMB: 32 });
    if (decoded.width > PHOTO_EDGE || decoded.height > PHOTO_EDGE || !decoded.width || !decoded.height) throw new Error('dimensions');
    const pixels = { width: decoded.width, height: decoded.height, data: decoded.data };
    let bytes = new Uint8Array(jpeg.encode(pixels, 80).data);
    // Decoding a valid JPEG can make a later encoding larger. Keep detailed
    // images within the storage limit through a bounded quality fallback.
    for (const quality of [65, 50]) {
      if (bytes.length <= PHOTO_BYTES) break;
      bytes = new Uint8Array(jpeg.encode(pixels, quality).data);
    }
    if (bytes.length > PHOTO_BYTES) throw new Error('size');
    return { bytes, width: decoded.width, height: decoded.height };
  } catch {
    throw new DomainError('VALIDATION', 'This photo could not be read safely. Choose another JPG, PNG, or WebP image.');
  }
}
