import { NextResponse } from 'next/server';
import { runScheduledJob } from '@/lib/scheduler/runScheduledJob';
import { loadEnv } from '@/lib/config/loader';
import { log } from '@/lib/util/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const env = loadEnv();
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  const url = new URL(request.url);
  const force = url.searchParams.get('force') === '1';
  try {
    const result = await runScheduledJob({ dryRun: false, force });
    return NextResponse.json({
      ok: true,
      ...(force ? { forced: true } : {}),
      ...(result.created ? { draft_id: result.created.id } : {}),
      ...(result.skipped ? { skipped: result.skipped } : {}),
      ...(result.warnings?.length ? { warnings: result.warnings } : {}),
    });
  } catch (err) {
    log.error('cron run failed', { err: String(err) });
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
