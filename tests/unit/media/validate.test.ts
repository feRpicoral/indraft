import { describe, it, expect } from 'vitest';
import { validateImage, withinPixelCeiling } from '@/lib/media/validate';

describe('validateImage', () => {
  it('accepts PNG under cap', () => {
    const r = validateImage({ mime: 'image/png', size: 1024 });

    expect(r.ok).toBe(true);
  });

  it('accepts JPEG under cap', () => {
    const r = validateImage({ mime: 'image/jpeg', size: 1024 });

    expect(r.ok).toBe(true);
  });

  it('rejects unsupported mime', () => {
    const r = validateImage({ mime: 'image/gif', size: 1024 });

    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unsupported mime/);
  });

  it('rejects oversize', () => {
    const r = validateImage({ mime: 'image/png', size: 10 * 1024 * 1024 });

    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/exceeds/);
  });
});

function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe('withinPixelCeiling', () => {
  it('accepts a typical article image', () => {
    expect(withinPixelCeiling(png(2260, 1266), 'image/png')).toBe(true);
  });

  it('rejects an image above the documented 36,152,320 pixel ceiling', () => {
    expect(withinPixelCeiling(png(8000, 5000), 'image/png')).toBe(false);
  });

  it('accepts an image just under the ceiling', () => {
    // 6012 x 6012 = 36,144,144
    expect(withinPixelCeiling(png(6012, 6012), 'image/png')).toBe(true);
  });

  it('rejects an image just over the ceiling', () => {
    // 6013 x 6013 = 36,156,169
    expect(withinPixelCeiling(png(6013, 6013), 'image/png')).toBe(false);
  });

  it('accepts an image whose dimensions cannot be read', () => {
    expect(withinPixelCeiling(Buffer.from('not an image'), 'image/png')).toBe(true);
  });

  it('rejects a small-byte image that is enormous in pixels', () => {
    // A flat-colour PNG compresses tiny while still blowing the pixel budget,
    // so the byte cap alone never catches it.
    expect(withinPixelCeiling(png(10000, 10000), 'image/png')).toBe(false);
  });
});
