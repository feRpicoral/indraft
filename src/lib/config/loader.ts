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
 * Load and validate the config. Throws ConfigError with a human-readable list
 * of issues on validation failure.
 *
 * Resolution order (first match wins):
 *   1. Explicit `path` argument (tests pass this)
 *   2. `$INDRAFT_CONFIG_YAML` — config inlined as a YAML string. This is how
 *      production runs on Vercel see the config; `config.yml` is gitignored
 *      because it carries personal data.
 *   3. `$INDRAFT_CONFIG` — path to a YAML file
 *   4. `./config.yml` (local dev)
 *   5. `./config.example.yml` (last resort, for first-run/testing only)
 */
export function loadConfig(path?: string): Config {
  if (path) {
    if (!existsSync(path)) {
      throw new ConfigError(`Config file not found at ${path}`);
    }
    return parseConfigYaml(readFileSync(path, 'utf8'), `config at ${path}`);
  }

  if (process.env.INDRAFT_CONFIG_YAML) {
    return parseConfigYaml(process.env.INDRAFT_CONFIG_YAML, 'INDRAFT_CONFIG_YAML');
  }

  const filePath = process.env.INDRAFT_CONFIG ?? defaultConfigPath();
  if (!existsSync(filePath)) {
    throw new ConfigError(
      `Config file not found at ${filePath}. Set INDRAFT_CONFIG_YAML (production) or copy config.example.yml to config.yml (local).`,
    );
  }
  return parseConfigYaml(readFileSync(filePath, 'utf8'), `config at ${filePath}`);
}

function parseConfigYaml(yamlText: string, label: string): Config {
  const parsed = yaml.load(yamlText);
  const result = ConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError(formatZodError(label, result.error));
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
