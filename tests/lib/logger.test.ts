import log4js from 'log4js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLogger } from '../../src/lib/logger';

describe('getLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns dedicated application and access loggers', () => {
    const getLoggerSpy = vi.spyOn(log4js, 'getLogger');

    const logger = getLogger();

    expect(getLoggerSpy).toHaveBeenNthCalledWith(1, 'application');
    expect(getLoggerSpy).toHaveBeenNthCalledWith(2, 'access');
    expect(logger.app).toBeDefined();
    expect(logger.access).toBeDefined();
  });
});
