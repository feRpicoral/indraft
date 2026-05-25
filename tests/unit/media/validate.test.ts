import { describe, it, expect } from 'vitest';
import { validateImage } from '@/lib/media/validate';

describe('validateImage', () => {
  it('accepts PNG under cap', () => {
    expect(validateImage({ mime: 'image/png', size: 1024 }).ok).toBe(true);
  });
  it('accepts JPEG under cap', () => {
    expect(validateImage({ mime: 'image/jpeg', size: 1024 }).ok).toBe(true);
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
