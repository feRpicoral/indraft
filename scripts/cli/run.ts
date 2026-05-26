import type { Command } from 'commander';
import { runScheduledJob } from '../../src/lib/scheduler/runScheduledJob';

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Run the scheduled job once against the configured KV')
    .option('-f, --force', 'Bypass the day-of-week + hour filter (smoke-test any day)')
    .action(async (opts: { force?: boolean }) => {
      const result = await runScheduledJob({ dryRun: false, force: opts.force === true });
      console.log(JSON.stringify(result, null, 2));
      if (result.skipped) process.exit(0);
      if (!result.created) process.exit(1);
    });
}
