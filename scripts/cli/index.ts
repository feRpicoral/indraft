#!/usr/bin/env node
import { Command } from 'commander';
import { loadEnvConfig } from '@next/env';
import { registerRun } from './run';
import { registerDryRun } from './dryRun';
import { registerAuth } from './auth';
import { registerCheckToken } from './checkToken';

// Load .env / .env.local / .env.development[.local] with Next.js precedence so
// `yarn indraft <cmd>` sees the same vars the dev server does. Must run before
// parseAsync triggers any action that calls loadEnv().
loadEnvConfig(process.cwd());

const program = new Command();
program.name('indraft').description('InDraft local CLI').version('0.1.0');

registerRun(program);
registerDryRun(program);
registerAuth(program);
registerCheckToken(program);

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
