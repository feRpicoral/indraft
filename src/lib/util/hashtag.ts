/**
 * Detect and strip a trailing block of hashtags from the body. Returns the
 * cleaned body plus the extracted tags (without the `#` prefix). Mid-sentence
 * hashtags are left in place — only the trailing block at the end of the post
 * is removed.
 *
 * Examples:
 *   "Post body.\n\n#typescript #nextjs"  → { body: "Post body.", extracted: ["typescript","nextjs"] }
 *   "We use #postgres because it works." → { body: ..., extracted: [] } (mid-sentence; left alone)
 *   "Body.\n\n#fullstack\n#webdev"        → { body: "Body.", extracted: ["fullstack","webdev"] }
 */
export function stripTrailingHashtagBlock(body: string): {
  body: string;
  extracted: string[];
} {
  const trimmed = body.replace(/\s+$/, '');
  // Match a contiguous trailing run of hashtags separated by spaces/newlines,
  // preceded by a newline-or-start so we don't eat a sentence ending in #tag.
  const re = /(?:\n\s*|^)((?:#[A-Za-z0-9][\w-]*(?:[ \t]+|\s*\n\s*)?)+)\s*$/;
  const m = trimmed.match(re);
  if (!m || m.index === undefined) return { body: trimmed, extracted: [] };
  const block = m[1] ?? '';
  const extracted = Array.from(block.matchAll(/#([A-Za-z0-9][\w-]*)/g)).map((x) => x[1]!);
  // Slice before the block starts (m.index points at the leading newline/start).
  const cleaned = trimmed.slice(0, m.index).replace(/\s+$/, '');
  return { body: cleaned, extracted };
}

/** Merge two hashtag lists, deduped (case-insensitive), preserving order from `a`. */
export function mergeHashtags(a: readonly string[], b: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of [...a, ...b]) {
    const norm = tag.replace(/^#+/, '').toLowerCase();
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}
