import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cleanupJob from '../../src/jobs/cleanup.job';
import heartbeatJob from '../../src/jobs/heartbeat.job';

describe('built-in jobs', () => {
  const info = vi.fn();
  const ctx = {
    logger: {
      app: {
        info,
      },
    },
  } as unknown as Parameters<typeof cleanupJob.run>[0];

  beforeEach(() => {
    info.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the default cleanup age when no option is provided', async () => {
    await cleanupJob.run(ctx);

    expect(info).toHaveBeenCalledWith(
      '[CleanupJob] Running cleanup for files older than 60 minutes...'
    );
  });

  it('uses a custom cleanup age when configured', async () => {
    await cleanupJob.run(ctx, { maxAgeMinutes: 15 });

    expect(info).toHaveBeenCalledWith(
      '[CleanupJob] Running cleanup for files older than 15 minutes...'
    );
  });

  it('logs a heartbeat timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-13T10:00:00.000Z'));

    await heartbeatJob.run(ctx);

    expect(info).toHaveBeenCalledWith('[HeartbeatJob] still alive at 2026-03-13T10:00:00.000Z');
  });
});
