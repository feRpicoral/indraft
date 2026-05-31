import type { Command } from 'commander';
import { latestCronAudit, listCronAudit } from '../../src/lib/state/cronAudit';

export function registerCronStatus(program: Command): void {
  program
    .command('cron-status')
    .description('Show recent cron audit entries from the configured KV')
    .option('-l, --limit <number>', 'Number of completed runs to show', '10')
    .action(async (opts: { limit: string }) => {
      const parsed = Number(opts.limit);
      const limit = Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 50) : 10;
      const [latest, history] = await Promise.all([
        latestCronAudit(),
        listCronAudit(limit),
      ]);
      console.log(JSON.stringify({ latest, history }, null, 2));
    });
}
