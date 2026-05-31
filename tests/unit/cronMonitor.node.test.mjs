import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateCronStatus } from '../../scripts/cronMonitor.mjs';

const now = Date.parse('2026-05-31T15:30:00Z');
const fresh = now - 30 * 60 * 1000;
const stale = now - 2 * 24 * 60 * 60 * 1000;

describe('cron monitor evaluation', () => {
  it('passes for a recent successful scheduled run', () => {
    const result = evaluateCronStatus(
      {
        latest: {
          id: 'run-1',
          status: 'success',
          started_at: fresh,
          force: false,
          dry_run: false,
        },
        history: [],
      },
      { now, maxAgeMinutes: 720 },
    );

    assert.equal(result.ok, true);
  });

  it('ignores forced runs', () => {
    const result = evaluateCronStatus(
      {
        latest: {
          id: 'forced',
          status: 'success',
          started_at: fresh,
          force: true,
          dry_run: false,
        },
        history: [],
      },
      { now, maxAgeMinutes: 720 },
    );

    assert.equal(result.ok, false);
    assert.match(result.reason, /no scheduled cron audit entry/);
  });

  it('fails for a recent scheduled error', () => {
    const result = evaluateCronStatus(
      {
        latest: {
          id: 'run-1',
          status: 'error',
          started_at: fresh,
          force: false,
          dry_run: false,
          error: 'boom',
        },
        history: [],
      },
      { now, maxAgeMinutes: 720 },
    );

    assert.equal(result.ok, false);
    assert.match(result.reason, /status is error/);
  });

  it('fails when the scheduled run is stale', () => {
    const result = evaluateCronStatus(
      {
        latest: {
          id: 'run-1',
          status: 'success',
          started_at: stale,
          force: false,
          dry_run: false,
        },
        history: [],
      },
      { now, maxAgeMinutes: 720 },
    );

    assert.equal(result.ok, false);
    assert.match(result.reason, /no scheduled cron audit entry/);
  });
});
