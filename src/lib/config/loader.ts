import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { ConfigSchema, type Config } from './schema';
import { EnvSchema, type Env } from './env';

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Load and validate `config.yml` (or a custom path). Throws ConfigError with a
 * human-readable list of issues on validation failure.
 *
 * Search order when no path is given:
 *   1. $INDRAFT_CONFIG
 *   2. ./config.yml
 *   3. ./config.example.yml (last resort — useful for tests)
 */
export function loadConfig(path?: string): Config {
  const candidate = path ?? process.env.INDRAFT_CONFIG ?? defaultConfigPath();
  if (!existsSync(candidate)) {
    throw new ConfigError(
      `Config file not found at ${candidate}. Copy config.example.yml to config.yml and fill it in.`,
    );
  }
  const raw = readFileSync(candidate, 'utf8');
  const parsed = yaml.load(raw);
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(formatZodError('config.yml', result.error));
  }
  return result.data;
}

/**
 * Validate process.env. Throws ConfigError listing every missing/invalid var.
 * Call once at app startup so failures surface immediately, not on first use.
 */
export function loadEnv(env: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(formatZodError('environment', result.error));
  }
  return result.data;
}

function defaultConfigPath(): string {
  const local = resolve(process.cwd(), 'config.yml');
  if (existsSync(local)) return local;
  return resolve(process.cwd(), 'config.example.yml');
}

function formatZodError(label: string, err: z.ZodError): string {
  const lines = err.issues.map((i) => {
    const path = i.path.length ? i.path.join('.') : '(root)';
    return `  - ${path}: ${i.message}`;
  });
  return `Invalid ${label}:\n${lines.join('\n')}`;
}
