/**
 * True only on the production Vercel runtime. Vercel sets VERCEL_ENV to
 * 'production' | 'preview' | 'development' on every deploy. NODE_ENV alone
 * is too coarse — Next sets it to 'production' during `next build` too —
 * so fail closed on either signal pointing at prod.
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
