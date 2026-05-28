/**
 * True only on the production Vercel runtime. Mirrors the predicate in
 * src/lib/state/kv.ts: NODE_ENV alone is too coarse because Next sets it to
 * 'production' during `next build` as well, so we also check VERCEL_ENV.
 * Vercel preview and `vercel dev` count as non-production.
 */
export function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV === 'production') return true;
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.VERCEL_ENV !== 'preview' &&
    process.env.VERCEL_ENV !== 'development'
  ) {
    return true;
  }
  return false;
}
