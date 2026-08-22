import { describe, it, expect } from 'vitest';
import {
  looksLikeSiteChrome,
  meetsMinimumSize,
  withoutDownscaleParams,
} from '@/lib/media/imageQuality';

function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe('looksLikeSiteChrome', () => {
  it.each([
    'https://arxiv.org/static/browse/0.3.4/images/arxiv-logo-fb.png',
    'https://github.blog/wp-content/uploads/2026/01/generic-github-logo-left.png',
    'https://example.com/assets/favicon.png',
    'https://example.com/img/default-thumbnail.jpg',
    'https://example.com/static/placeholder.png',
    'https://example.com/logos/acme.png',
  ])('rejects %s', (url) => {
    expect(looksLikeSiteChrome(url)).toBe(true);
  });

  it.each([
    'https://platform.theverge.com/wp-content/uploads/sites/2/2026/08/DCD_Bose.jpg',
    'https://cdn.arstechnica.net/wp-content/uploads/2015/05/1st-Dragon-Flight.jpg',
    'https://news.crunchbase.com/wp-content/uploads/Computer_chip_02.jpg',
    'https://huggingface.co/blog/assets/multi-vector-encoder/st-hf-lighton-thumbnail.png',
  ])('accepts %s', (url) => {
    expect(looksLikeSiteChrome(url)).toBe(false);
  });

  it('ignores chrome tokens that appear only in the query string', () => {
    expect(looksLikeSiteChrome('https://example.com/photo.jpg?ref=logo')).toBe(false);
  });
});

describe('withoutDownscaleParams', () => {
  it('strips CDN sizing params', () => {
    expect(withoutDownscaleParams('https://images.ctfassets.net/a/b/hero.png?w=300&q=30')).toBe(
      'https://images.ctfassets.net/a/b/hero.png',
    );
  });

  it('keeps unrelated params', () => {
    expect(withoutDownscaleParams('https://example.com/a.jpg?w=300&token=abc')).toBe(
      'https://example.com/a.jpg?token=abc',
    );
  });

  it('returns null when there is nothing to strip', () => {
    expect(withoutDownscaleParams('https://example.com/a.jpg')).toBeNull();
  });

  it('returns null for an unparseable url', () => {
    expect(withoutDownscaleParams('not a url')).toBeNull();
  });
});

describe('meetsMinimumSize', () => {
  it('accepts a full-size article image', () => {
    expect(meetsMinimumSize(png(1200, 627), 'image/png')).toBe(true);
  });

  it('rejects a feed thumbnail below the floor', () => {
    expect(meetsMinimumSize(png(300, 168), 'image/png')).toBe(false);
  });

  it('rejects an image that is wide enough but too short', () => {
    expect(meetsMinimumSize(png(1200, 200), 'image/png')).toBe(false);
  });

  it('accepts an image whose dimensions cannot be read', () => {
    expect(meetsMinimumSize(Buffer.from('not an image'), 'image/png')).toBe(true);
  });
});
