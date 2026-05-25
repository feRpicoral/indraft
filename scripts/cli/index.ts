#!/usr/bin/env node
import { Command } from 'commander';
import { registerRun } from './run';
import { registerDryRun } from './dryRun';
import { registerAuth } from './auth';
import { registerCheckToken } from './checkToken';

const program = new Command();
program.name('indraft').description('InDraft local CLI').version('0.1.0');

registerRun(program);
registerDryRun(program);
registerAuth(program);
registerCheckToken(program);

program.parseAsync(process.argv).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
