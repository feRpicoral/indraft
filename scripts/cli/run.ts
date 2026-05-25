import type { Command } from 'commander';
import { runScheduledJob } from '../../src/lib/scheduler/runScheduledJob';

export function registerRun(program: Command): void {
  program
    .command('run')
    .description('Run the scheduled job once against the configured KV')
    .action(async () => {
      const result = await runScheduledJob({ dryRun: false });
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
      if (result.skipped) process.exit(0);
      if (!result.created) process.exit(1);
    });
}
