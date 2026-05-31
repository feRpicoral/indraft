const DEFAULT_MAX_AGE_MINUTES = 12 * 60;
const STATUS_LIMIT = 10;

export function evaluateCronStatus(data, opts = {}) {
  const now = opts.now ?? Date.now();
  const maxAgeMinutes = opts.maxAgeMinutes ?? DEFAULT_MAX_AGE_MINUTES;
  const cutoff = now - maxAgeMinutes * 60 * 1000;
  const entriesById = new Map();

  for (const entry of [data?.latest, ...(data?.history ?? [])]) {
    if (!entry || typeof entry !== 'object') continue;
    entriesById.set(entry.id ?? `${entry.started_at}:${entry.status}`, entry);
  }

  const recentScheduled = Array.from(entriesById.values())
    .filter((entry) => entry.force === false)
    .filter((entry) => entry.dry_run !== true)
    .filter((entry) => typeof entry.started_at === 'number')
    .filter((entry) => entry.started_at >= cutoff)
    .sort((a, b) => b.started_at - a.started_at);

  const latestScheduled = recentScheduled[0];
  if (!latestScheduled) {
    return {
      ok: false,
      reason: `no scheduled cron audit entry in the last ${maxAgeMinutes} minutes`,
      cutoff,
    };
  }

  if (latestScheduled.status !== 'success') {
    return {
      ok: false,
      reason: `latest scheduled cron status is ${latestScheduled.status}`,
      entry: latestScheduled,
      cutoff,
    };
  }

  return { ok: true, entry: latestScheduled, cutoff };
}

export async function fetchCronStatus({ appUrl, cronSecret }) {
  const url = new URL('/api/cron/status', normalizeAppUrl(appUrl));
  url.searchParams.set('limit', String(STATUS_LIMIT));
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${cronSecret}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`cron status endpoint returned ${res.status}: ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`cron status endpoint returned invalid JSON: ${String(err)}`);
  }
}

export async function sendAlertEmail({ resendApiKey, from, to, reason, evaluation, status }) {
  const recipients = to
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (recipients.length === 0) throw new Error('NOTIFY_TO_ADDRESS did not contain a recipient');

  const text = renderAlertText({ reason, evaluation, status });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${resendApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: 'InDraft cron missed or failed',
      text,
      html: `<pre>${escapeHtml(text)}</pre>`,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Resend alert failed with ${res.status}: ${body.slice(0, 500)}`);
  }
}

export async function main(env = process.env) {
  const appUrl = requiredEnv(env, 'INDRAFT_APP_URL');
  const cronSecret = requiredEnv(env, 'INDRAFT_CRON_SECRET');
  const resendApiKey = requiredEnv(env, 'RESEND_API_KEY');
  const from = requiredEnv(env, 'NOTIFY_FROM_ADDRESS');
  const to = requiredEnv(env, 'NOTIFY_TO_ADDRESS');
  const maxAgeMinutes = parsePositiveInteger(env.MAX_AGE_MINUTES, DEFAULT_MAX_AGE_MINUTES);

  let status = null;
  let evaluation;
  try {
    status = await fetchCronStatus({ appUrl, cronSecret });
    evaluation = evaluateCronStatus(status, { maxAgeMinutes });
  } catch (err) {
    evaluation = {
      ok: false,
      reason: `cron status check failed: ${errorMessage(err)}`,
    };
  }

  if (evaluation.ok) {
    console.log(
      `Cron healthy: ${evaluation.entry.draft_id ?? 'no draft id'} at ${formatTime(evaluation.entry.started_at)}`,
    );
    return;
  }

  await sendAlertEmail({
    resendApiKey,
    from,
    to,
    reason: evaluation.reason,
    evaluation,
    status,
  });
  throw new Error(evaluation.reason);
}

function renderAlertText({ reason, evaluation, status }) {
  const entry = evaluation.entry;
  const lines = [
    'InDraft cron monitor failed.',
    '',
    `Reason: ${reason}`,
    `Checked at: ${new Date().toISOString()}`,
  ];

  if (evaluation.cutoff) {
    lines.push(`Expected scheduled run after: ${formatTime(evaluation.cutoff)}`);
  }

  if (entry) {
    lines.push('', 'Latest scheduled audit entry:');
    lines.push(`- status: ${entry.status}`);
    lines.push(`- started_at: ${formatTime(entry.started_at)}`);
    if (entry.finished_at) lines.push(`- finished_at: ${formatTime(entry.finished_at)}`);
    if (entry.skipped) lines.push(`- skipped: ${entry.skipped}`);
    if (entry.error) lines.push(`- error: ${entry.error}`);
    if (entry.draft_id) lines.push(`- draft_id: ${entry.draft_id}`);
  }

  if (status?.latest) {
    lines.push('', 'Raw latest audit entry:');
    lines.push(JSON.stringify(status.latest, null, 2));
  }

  return lines.join('\n');
}

function requiredEnv(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function parsePositiveInteger(raw, fallback) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function normalizeAppUrl(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

function formatTime(ms) {
  return typeof ms === 'number' ? new Date(ms).toISOString() : 'unknown';
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(errorMessage(err));
    process.exitCode = 1;
  });
}
