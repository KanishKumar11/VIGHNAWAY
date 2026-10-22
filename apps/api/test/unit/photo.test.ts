import { PHOTO_BODY_LIMIT_BYTES, PHOTO_MAX_BYTES, ReportPhotoInputSchema } from '@vighnaway/contracts';
import { describe, expect, it } from 'vitest';
import { looksLikeJpeg } from '../../src/reports/photos.service';

/** A tiny but structurally valid JPEG envelope: SOI, a marker, EOI. */
const jpeg = (n = 200) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n, 1), Buffer.from([0xff, 0xd9])]);

describe('photo contract', () => {
  const ok = { deviceId: 'device-aaaa', contentType: 'image/jpeg' as const, data: jpeg().toString('base64') };

  it('accepts a small base64 JPEG from a device', () => {
    expect(ReportPhotoInputSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects other types, data: urls and unknown fields', () => {
    expect(ReportPhotoInputSchema.safeParse({ ...ok, contentType: 'image/png' }).success).toBe(false);
    expect(ReportPhotoInputSchema.safeParse({ ...ok, data: `data:image/jpeg;base64,${ok.data}` }).success).toBe(false);
    expect(ReportPhotoInputSchema.safeParse({ ...ok, lat: 19.1 }).success).toBe(false);
  });

  it('caps the size: base64 of more than the limit is refused before it is decoded', () => {
    const big = Buffer.alloc(PHOTO_MAX_BYTES + 1000, 7).toString('base64');
    expect(ReportPhotoInputSchema.safeParse({ ...ok, data: big }).success).toBe(false);
  });

  it('leaves room in the route body limit for the JSON envelope', () => {
    const maxBase64 = Buffer.alloc(PHOTO_MAX_BYTES, 7).toString('base64');
    const body = JSON.stringify({ ...ok, data: maxBase64 });
    expect(ReportPhotoInputSchema.safeParse({ ...ok, data: maxBase64 }).success).toBe(true);
    expect(body.length).toBeLessThan(PHOTO_BODY_LIMIT_BYTES);
  });
});

describe('looksLikeJpeg', () => {
  it('accepts a JPEG envelope and refuses text, PNG and truncated data', () => {
    expect(looksLikeJpeg(jpeg())).toBe(true);
    expect(looksLikeJpeg(Buffer.from('<script>alert(1)</script>'))).toBe(false);
    expect(looksLikeJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe(false);
    expect(looksLikeJpeg(jpeg().subarray(0, 100))).toBe(false);
  });
});
