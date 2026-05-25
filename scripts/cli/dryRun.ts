import type { Command } from 'commander';
import { runScheduledJob } from '../../src/lib/scheduler/runScheduledJob';

export function registerDryRun(program: Command): void {
  program
    .command('dry-run')
    .description(
      'Run collect → draft → lint → notify pipeline without LinkedIn publish or real email',
    )
    .action(async () => {
      const result = await runScheduledJob({ dryRun: true });
      console.log(JSON.stringify(result, null, 2));
    });
}
