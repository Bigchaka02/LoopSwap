import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { PHOTO_BYTES, sanitizePhoto } from '../../server/image-validation';

const fixture = (width = 2, height = 2) => jpeg.encode({ width, height, data: new Uint8Array(width * height * 4).fill(255), comments: ['private-location-note'] }, 80).data;

describe('bounded pixel-only photo validation', () => {
  it('re-encodes actual pixels and drops comments and EXIF', () => {
    const input = fixture(), metadata = new TextEncoder().encode('Exif\0\0private-gps-coordinates');
    const exif = new Uint8Array(input.length + metadata.length + 4);
    exif.set(input.subarray(0, 2)); exif.set([255,225,0,metadata.length+2],2); exif.set(metadata,6); exif.set(input.subarray(2),6+metadata.length);
    const output = sanitizePhoto(exif), decoded = jpeg.decode(output.bytes, { useTArray: true });
    expect([output.width,output.height]).toEqual([2,2]); expect(decoded.data.length).toBe(16);
    expect(decoded.comments ?? []).toEqual([]);
    expect(new TextDecoder().decode(output.bytes)).not.toContain('private-gps-coordinates');
    expect(new TextDecoder().decode(output.bytes)).not.toContain('private-location-note');
  });
  it('rejects non-images, SVG, empty and truncated JPEGs', () => {
    for (const input of [new Uint8Array(),new TextEncoder().encode('<svg onload="alert(1)"/>'),new Uint8Array([137,80,78,71]),new Uint8Array([255,216,255])]) expect(() => sanitizePhoto(input)).toThrow();
  });
  it('rejects byte overflow and dimensions beyond the processing budget', () => {
    expect(() => sanitizePhoto(new Uint8Array(PHOTO_BYTES+1))).toThrow('under 1 MB');
    expect(() => sanitizePhoto(fixture(901,1))).toThrow('safely');
    const bomb = new Uint8Array(fixture());
    const marker = bomb.findIndex((value,i) => value===255 && bomb[i+1]===192);
    expect(marker).toBeGreaterThan(0); bomb.set([255,255,255,255],marker+5);
    expect(() => sanitizePhoto(bomb)).toThrow('safely');
  });
});
