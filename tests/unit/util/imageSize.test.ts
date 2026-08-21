import { describe, it, expect } from 'vitest';
import { readImageDimensions } from '@/lib/util/imageSize';

function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function jpeg(width: number, height: number, { withLeadingSegment = false } = {}): Buffer {
  const parts: number[] = [0xff, 0xd8];
  if (withLeadingSegment) {
    // APP0 the parser must skip over before reaching the frame header.
    parts.push(0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46);
  }
  parts.push(0xff, 0xc0, 0x00, 0x0b, 0x08);
  parts.push((height >> 8) & 0xff, height & 0xff);
  parts.push((width >> 8) & 0xff, width & 0xff);
  return Buffer.from(parts);
}

describe('readImageDimensions (PNG)', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(readImageDimensions(png(1200, 627), 'image/png')).toEqual({
      width: 1200,
      height: 627,
    });
  });

  it('returns null when the signature does not match', () => {
    const bogus = png(100, 100);
    bogus.writeUInt8(0x00, 0);

    expect(readImageDimensions(bogus, 'image/png')).toBeNull();
  });

  it('returns null on a truncated buffer', () => {
    expect(readImageDimensions(png(100, 100).subarray(0, 12), 'image/png')).toBeNull();
  });
});

describe('readImageDimensions (JPEG)', () => {
  it('reads dimensions from the start-of-frame header', () => {
    expect(readImageDimensions(jpeg(1456, 816), 'image/jpeg')).toEqual({
      width: 1456,
      height: 816,
    });
  });

  it('skips intermediate segments before the frame header', () => {
    expect(readImageDimensions(jpeg(300, 168, { withLeadingSegment: true }), 'image/jpeg')).toEqual(
      {
        width: 300,
        height: 168,
      },
    );
  });

  it('returns null when there is no start-of-frame segment', () => {
    expect(
      readImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04]), 'image/jpeg'),
    ).toBeNull();
  });
});

describe('readImageDimensions (other)', () => {
  it('returns null for mimes it does not parse', () => {
    expect(readImageDimensions(png(1200, 627), 'image/webp')).toBeNull();
  });
});
