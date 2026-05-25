import { NextResponse } from 'next/server';
import { getLinkedInToken } from '@/lib/state/tokens';
import { daysToExpiry } from '@/lib/auth/tokenExpiry';
import { getKv } from '@/lib/state/kv';
import { loadConfig } from '@/lib/config/loader';
import { buildProvider } from '@/lib/llm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const ts = new Date().toISOString();
  const [kvOk, token, llmOk] = await Promise.all([
    pingKv(),
    getLinkedInToken().catch(() => null),
    pingLlm(),
  ]);
  return NextResponse.json({
    ts,
    kv: kvOk,
    llm: llmOk,
    token_days_left: token ? daysToExpiry(token) : null,
    has_linkedin_token: Boolean(token),
  });
}

async function pingKv(): Promise<boolean> {
  try {
    await getKv().get('__health_probe__');
    return true;
  } catch {
    return false;
  }
}

async function pingLlm(): Promise<boolean> {
  try {
    const cfg = loadConfig();
    const llm = buildProvider(cfg);
    return await llm.health();
  } catch {
    return false;
  }
}
