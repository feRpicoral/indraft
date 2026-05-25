import { Resend } from 'resend';
import { log } from '../util/logger';

export interface SendArgs {
  subject: string;
  html: string;
  text: string;
}

export interface ResendOpts {
  apiKey: string;
  from: string;
  to: string;
}

/**
 * Send-only Resend client. We don't expose anything other than `send` so
 * there's no accidental inbound/IMAP path.
 */
export class ResendNotifier {
  private readonly client: Resend;
  constructor(private readonly opts: ResendOpts) {
    this.client = new Resend(opts.apiKey);
  }

  async send(args: SendArgs): Promise<void> {
    const { error, data } = await this.client.emails.send({
      from: this.opts.from,
      to: this.opts.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (error) {
      log.error('resend send failed', { error: String(error) });
      throw new Error(`Resend: ${error.message ?? 'unknown error'}`);
    }
    log.info('resend send ok', { id: data?.id });
  }
}
