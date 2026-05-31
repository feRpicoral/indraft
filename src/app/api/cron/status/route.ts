import { NextResponse } from 'next/server';
import { loadEnv } from '@/lib/config/loader';
import { latestCronAudit, listCronAudit } from '@/lib/state/cronAudit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const env = loadEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const url = new URL(request.url);
  const parsedLimit = Number(url.searchParams.get('limit') ?? 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(Math.trunc(parsedLimit), 1), 50)
    : 10;
  const [latest, history] = await Promise.all([latestCronAudit(), listCronAudit(limit)]);
  return NextResponse.json({ ok: true, latest, history });
}
