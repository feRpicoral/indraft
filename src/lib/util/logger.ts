/**
 * Tiny structured logger. JSON lines so Vercel's log search works.
 * Avoid adding a dep; console + JSON is enough.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const ENABLED_LEVELS: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: number = ENABLED_LEVELS[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 1;

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (ENABLED_LEVELS[level] < MIN_LEVEL) return;
  const payload = { ts: new Date().toISOString(), level, msg, ...fields };
  // Use console[level] so Vercel's log UI categorizes correctly.
  // eslint-disable-next-line no-console
  (console[level] ?? console.log)(JSON.stringify(payload));
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
};
