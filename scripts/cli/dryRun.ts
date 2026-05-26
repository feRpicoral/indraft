import type { Command } from 'commander';
import { runScheduledJob } from '../../src/lib/scheduler/runScheduledJob';

export function registerDryRun(program: Command): void {
  program
    .command('dry-run')
    .description(
      'Run collect → draft → lint → notify pipeline without LinkedIn publish or real email',
    )
    .option('-f, --force', 'Bypass the day-of-week + hour filter (smoke-test any day)')
    .action(async (opts: { force?: boolean }) => {
      const result = await runScheduledJob({ dryRun: true, force: opts.force === true });
      console.log(JSON.stringify(result, null, 2));
    });
}
