import type { Command } from 'commander';
import { getLinkedInToken } from '../../src/lib/state/tokens';
import { daysToExpiry, isExpired } from '../../src/lib/auth/tokenExpiry';

export function registerCheckToken(program: Command): void {
  program
    .command('check-token')
    .description('Print days-to-expiry of the LinkedIn token. Exits 1 if < 7 days remain.')
    .action(async () => {
      const token = await getLinkedInToken();
      if (!token) {
        console.log('LinkedIn token: missing');
        process.exit(1);
      }
      if (isExpired(token)) {
        console.log('LinkedIn token: EXPIRED');
        process.exit(1);
      }
      const days = daysToExpiry(token);
      console.log(`LinkedIn token: ${days} days left`);
      if (days < 7) process.exit(1);
    });
}
