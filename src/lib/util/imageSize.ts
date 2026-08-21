export interface ImageDimensions {
  width: number;
  height: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Read pixel dimensions straight out of a PNG or JPEG header. Only these two
 * formats are handled because `downloadImageBytes` rejects everything else.
 *
 * Returns null when the buffer is truncated or the header doesn't parse;
 * callers must treat that as "unknown size", never as "too small".
 */
export function readImageDimensions(bytes: Buffer, mime: string): ImageDimensions | null {
  if (mime === 'image/png') return readPngDimensions(bytes);
  if (mime === 'image/jpeg') return readJpegDimensions(bytes);
  return null;
}

function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  // 8-byte signature, 4-byte chunk length, 4-byte "IHDR", then width/height.
  if (bytes.length < 24) return null;
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

/** Frame headers carrying dimensions. C4/C8/CC share the 0xFFCn range but don't. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  if (bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    let marker = bytes[offset + 1]!;
    // Runs of 0xFF are legal padding before a marker.
    while (marker === 0xff && offset + 2 < bytes.length) {
      offset += 1;
      marker = bytes[offset + 1]!;
    }
    offset += 2;
    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) continue;
    if (offset + 1 >= bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2) return null;
    if (isStartOfFrame(marker)) {
      // Highest index read below is offset + 6.
      if (offset + 6 >= bytes.length) return null;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }
    offset += segmentLength;
  }
  return null;
}
