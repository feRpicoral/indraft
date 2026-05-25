import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import { loadEnv } from '../../src/lib/config/loader';

export function registerAuth(program: Command): void {
  program
    .command('auth')
    .description('Open the LinkedIn OAuth flow against the deployed app, store token in KV')
    .option('-u, --url <url>', 'Deployed app URL (overrides APP_URL)')
    .action(async (opts: { url?: string }) => {
      const env = loadEnv();
      const base = opts.url ?? env.APP_URL;
      if (!base) {
        console.error('Set APP_URL or pass --url with your deployed URL.');
        process.exit(1);
      }
      const bootstrap = env.ENROLLMENT_BOOTSTRAP_TOKEN;
      if (!bootstrap) {
        console.error('ENROLLMENT_BOOTSTRAP_TOKEN missing — first-time OAuth needs it.');
        process.exit(1);
      }
      const target = `${base}/api/auth/linkedin/start?bootstrap=${encodeURIComponent(bootstrap)}`;
      console.log(`Opening ${target}`);
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(cmd, [target], { stdio: 'ignore', detached: true }).unref();
      console.log('Complete the flow in your browser. The callback writes the token to KV.');
    });
}
