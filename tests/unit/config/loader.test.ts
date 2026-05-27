import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadEnv, ConfigError } from '@/lib/config/loader';

describe('loadConfig', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'indraft-cfg-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('parses a minimal valid config', () => {
    const path = join(tmp, 'config.yml');
    writeFileSync(
      path,
      `
profile:
  about: ${'a'.repeat(40)}
schedule:
  days: [MON, WED, FRI]
  timezone: America/New_York
sources: {}
content:
  pillars: [fullstack, news_opinion]
llm:
  draft_model: anthropic/claude-opus-4-7
  utility_model: anthropic/claude-haiku-4-5-20251001
`,
    );

    const cfg = loadConfig(path);

    expect(cfg.schedule.hour).toBe(9);
    expect(cfg.post.link_placement).toBe('none');
    expect(cfg.content.linter.max_em_dashes).toBe(2);
    expect(cfg.review.link_ttl_hours).toBe(24);
  });

  it('rejects a config with a too-short about field, listing the path', () => {
    const path = join(tmp, 'config.yml');
    writeFileSync(
      path,
      `
profile:
  about: too short
schedule:
  days: [MON]
  timezone: UTC
sources: {}
content:
  pillars: [x]
llm:
  draft_model: m
  utility_model: m
`,
    );

    let captured: Error | undefined;
    try {
      loadConfig(path);
    } catch (e) {
      captured = e as Error;
    }

    expect(captured).toBeInstanceOf(ConfigError);
    expect(captured?.message).toContain('profile.about');
  });

  it('throws ConfigError when the file is missing', () => {
    const missing = join(tmp, 'nope.yml');

    expect(() => loadConfig(missing)).toThrow(/Config file not found/);
  });

  it('reads config from INDRAFT_CONFIG_YAML when set (production path)', () => {
    const prev = process.env.INDRAFT_CONFIG_YAML;
    process.env.INDRAFT_CONFIG_YAML = `
profile:
  about: ${'a'.repeat(40)}
schedule:
  days: [MON]
  timezone: UTC
sources: {}
content:
  pillars: [fullstack]
llm:
  draft_model: opus
  utility_model: haiku
`;

    try {
      const cfg = loadConfig();

      expect(cfg.llm.draft_model).toBe('opus');
    } finally {
      if (prev !== undefined) process.env.INDRAFT_CONFIG_YAML = prev;
      else delete process.env.INDRAFT_CONFIG_YAML;
    }
  });

  it('rejects empty pillars (must have at least one)', () => {
    const path = join(tmp, 'config.yml');
    writeFileSync(
      path,
      `
profile:
  about: ${'a'.repeat(40)}
schedule:
  days: [MON]
  timezone: UTC
sources: {}
content:
  pillars: []
llm:
  draft_model: m
  utility_model: m
`,
    );

    expect(() => loadConfig(path)).toThrow(/content\.pillars/);
  });
});

describe('loadEnv', () => {
  it('accepts a valid env', () => {
    const env = loadEnv({
      MAGIC_LINK_SIGNING_SECRET: 'x'.repeat(40),
      WEBAUTHN_RP_ID: 'localhost',
      CRON_SECRET: 'cron',
      NOTIFY_TO_ADDRESS: 'a@b.com',
      NOTIFY_FROM_ADDRESS: 'c@d.com',
    });

    expect(env.WEBAUTHN_RP_ID).toBe('localhost');
  });

  it('rejects a short signing secret', () => {
    const input = {
      MAGIC_LINK_SIGNING_SECRET: 'short',
      WEBAUTHN_RP_ID: 'localhost',
      CRON_SECRET: 'cron',
      NOTIFY_TO_ADDRESS: 'a@b.com',
      NOTIFY_FROM_ADDRESS: 'c@d.com',
    };

    expect(() => loadEnv(input)).toThrow(/MAGIC_LINK_SIGNING_SECRET/);
  });

  it('rejects an invalid email address', () => {
    const input = {
      MAGIC_LINK_SIGNING_SECRET: 'x'.repeat(40),
      WEBAUTHN_RP_ID: 'localhost',
      CRON_SECRET: 'cron',
      NOTIFY_TO_ADDRESS: 'not-an-email',
      NOTIFY_FROM_ADDRESS: 'c@d.com',
    };

    expect(() => loadEnv(input)).toThrow(/NOTIFY_TO_ADDRESS/);
  });
});
