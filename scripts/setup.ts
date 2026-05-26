#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { confirm, input, password } from '@inquirer/prompts';

const REPO_SLUG = 'feRpicoral/indraft';

interface StepResult {
  name: string;
  status: 'ok' | 'skipped' | 'manual' | 'failed';
  note?: string;
}

async function main() {
  banner();
  const results: StepResult[] = [];

  results.push(await ensureGhRepo());
  results.push(await ensureVercelLink());
  results.push(await ensureKvStore());
  results.push(await ensureSecrets());
  results.push(await ensureConfigYaml());
  results.push(await checkResendDomain());

  summary(results);
  manualChecklist();
}

function banner() {
  console.log('\n=== InDraft setup ===');
  console.log('Each step state-checks first; safe to re-run after a partial setup.\n');
}

async function ensureGhRepo(): Promise<StepResult> {
  const name = 'github repo';
  if (!has('gh')) return { name, status: 'manual', note: 'gh CLI not installed' };
  if (sh(`gh repo view ${REPO_SLUG} --json name 2>/dev/null`).ok) {
    return { name, status: 'skipped', note: `${REPO_SLUG} already exists` };
  }
  const ok = await confirm({ message: `Create public GitHub repo ${REPO_SLUG}?`, default: true });
  if (!ok) return { name, status: 'skipped' };
  const r = sh(`gh repo create ${REPO_SLUG} --public --source=. --remote=origin --push`);
  return r.ok ? { name, status: 'ok' } : { name, status: 'failed', note: r.stderr };
}

async function ensureVercelLink(): Promise<StepResult> {
  const name = 'vercel project';
  if (!has('vercel')) {
    return { name, status: 'manual', note: 'install with `yarn dlx vercel login` then re-run' };
  }
  if (existsSync(join(process.cwd(), '.vercel', 'project.json'))) {
    return { name, status: 'skipped', note: 'already linked' };
  }
  const ok = await confirm({ message: 'Link a Vercel project? (interactive)', default: true });
  if (!ok) return { name, status: 'skipped' };
  const r = spawnSync('vercel', ['link'], { stdio: 'inherit' });
  return r.status === 0 ? { name, status: 'ok' } : { name, status: 'failed' };
}

async function ensureKvStore(): Promise<StepResult> {
  const name = 'vercel kv store';
  if (!has('vercel')) return { name, status: 'manual' };
  const list = sh('vercel storage ls 2>/dev/null');
  if (list.ok && list.stdout.includes('indraft-kv')) {
    return { name, status: 'skipped', note: 'indraft-kv already exists' };
  }
  const ok = await confirm({ message: 'Create Vercel KV store "indraft-kv"?', default: true });
  if (!ok) return { name, status: 'skipped' };
  const r = sh('vercel storage create kv indraft-kv');
  if (!r.ok) return { name, status: 'failed', note: r.stderr };
  sh('vercel env pull .env.local');
  return { name, status: 'ok' };
}

interface SecretDef {
  key: string;
  description: string;
  secret?: boolean;
  generate?: () => string;
}

const SECRETS: SecretDef[] = [
  { key: 'LINKEDIN_CLIENT_ID', description: 'LinkedIn app Client ID' },
  { key: 'LINKEDIN_CLIENT_SECRET', description: 'LinkedIn app Client Secret', secret: true },
  { key: 'OPENROUTER_API_KEY', description: 'OpenRouter API key', secret: true },
  { key: 'ANTHROPIC_API_KEY', description: 'Anthropic API key (BYOK)', secret: true },
  { key: 'RESEND_API_KEY', description: 'Resend API key', secret: true },
  { key: 'NOTIFY_TO_ADDRESS', description: 'Where InDraft sends notifications (your inbox)' },
  { key: 'NOTIFY_FROM_ADDRESS', description: 'Verified Resend sender' },
  { key: 'PEXELS_API_KEY', description: 'Pexels API key', secret: true },
  { key: 'WEBAUTHN_RP_ID', description: 'WebAuthn relying-party ID (your bare domain)' },
  { key: 'APP_URL', description: 'Deployed origin (no trailing slash), e.g. https://indraft.you.dev' },
  {
    key: 'MAGIC_LINK_SIGNING_SECRET',
    description: 'Signs magic links (auto-generated)',
    secret: true,
    generate: () => randomBytes(32).toString('base64url'),
  },
  {
    key: 'CRON_SECRET',
    description: 'Vercel cron auth (auto-generated)',
    secret: true,
    generate: () => randomBytes(32).toString('base64url'),
  },
  {
    key: 'ENROLLMENT_BOOTSTRAP_TOKEN',
    description: 'One-time passkey enrollment token (auto-generated)',
    secret: true,
    generate: () => randomBytes(32).toString('base64url'),
  },
];

async function ensureSecrets(): Promise<StepResult> {
  const name = 'env secrets';
  if (!has('vercel')) return { name, status: 'manual' };
  const list = sh('vercel env ls 2>/dev/null');
  const existing = new Set(parseEnvKeys(list.stdout));
  const missing = SECRETS.filter((s) => !existing.has(s.key));
  if (missing.length === 0) {
    return { name, status: 'skipped', note: 'all required secrets already set' };
  }
  console.log(`\nMissing ${missing.length} secrets. We'll add them one at a time.`);
  for (const s of missing) {
    let value: string;
    if (s.generate) {
      const accept = await confirm({
        message: `${s.key} (${s.description}) — auto-generate?`,
        default: true,
      });
      value = accept ? s.generate() : await ask(s);
    } else {
      value = await ask(s);
    }
    const r = spawnSync('vercel', ['env', 'add', s.key, 'production', 'preview', 'development'], {
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (r.status !== 0) return { name, status: 'failed', note: `failed on ${s.key}` };
  }
  return { name, status: 'ok' };
}

async function ask(s: SecretDef): Promise<string> {
  if (s.secret) return password({ message: `${s.key}: ${s.description}` });
  return input({ message: `${s.key}: ${s.description}` });
}

async function checkResendDomain(): Promise<StepResult> {
  const name = 'resend domain';
  return {
    name,
    status: 'manual',
    note: 'Verify your sender domain in Resend dashboard. https://resend.com/domains',
  };
}

async function ensureConfigYaml(): Promise<StepResult> {
  const name = 'config (INDRAFT_CONFIG_YAML)';
  if (!has('vercel')) return { name, status: 'manual' };
  const list = sh('vercel env ls 2>/dev/null');
  if (parseEnvKeys(list.stdout).includes('INDRAFT_CONFIG_YAML')) {
    return { name, status: 'skipped', note: 'already set; run `vercel env rm INDRAFT_CONFIG_YAML` to update' };
  }
  const local = join(process.cwd(), 'config.yml');
  if (!existsSync(local)) {
    return {
      name,
      status: 'manual',
      note: 'create config.yml first (cp config.example.yml config.yml), then re-run setup',
    };
  }
  const ok = await confirm({
    message: 'Upload local config.yml to Vercel as INDRAFT_CONFIG_YAML?',
    default: true,
  });
  if (!ok) return { name, status: 'skipped' };
  const yamlBody = readFileSync(local, 'utf8');
  const r = spawnSync('vercel', ['env', 'add', 'INDRAFT_CONFIG_YAML', 'production', 'preview', 'development'], {
    input: yamlBody,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  return r.status === 0
    ? { name, status: 'ok' }
    : { name, status: 'failed', note: 'env add failed' };
}

function summary(results: StepResult[]) {
  console.log('\n=== Summary ===');
  for (const r of results) {
    const tag =
      r.status === 'ok' ? '✓' : r.status === 'skipped' ? '·' : r.status === 'manual' ? '⚠' : '✗';
    console.log(`${tag} ${r.name}${r.note ? ` — ${r.note}` : ''}`);
  }
}

function manualChecklist() {
  console.log(`
=== Manual steps (no CLI exists for these) ===

1. LinkedIn Developer Portal — create app + Page, enable products:
   - "Share on LinkedIn" (w_member_social)
   - "Sign In with LinkedIn using OpenID Connect" (openid profile email)
   https://www.linkedin.com/developers/apps

2. OpenRouter — sign up + attach BYOK Anthropic key:
   https://openrouter.ai/keys → BYOK section

3. Pexels API key:
   https://www.pexels.com/api/

4. After deploy:
   - run \`yarn indraft auth\` to seed the LinkedIn token
   - visit https://<your-domain>/enroll?token=$ENROLLMENT_BOOTSTRAP_TOKEN to register a passkey

5. Copy config.example.yml → config.yml and fill in your profile + sources.

You can re-run \`yarn setup\` any time. Done.
`);
}

// --- helpers ---

function has(bin: string): boolean {
  try {
    execSync(`command -v ${bin}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

interface ShResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function sh(cmd: string): ShResult {
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, stdout, stderr: '' };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { ok: false, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function parseEnvKeys(stdout: string): string[] {
  const keys: string[] = [];
  for (const line of stdout.split('\n')) {
    const m = line.match(/^\s*([A-Z][A-Z0-9_]+)\s/);
    if (m && m[1]) keys.push(m[1]);
  }
  return keys;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

