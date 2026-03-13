import { describe, expect, it } from 'vitest';
import { SecurityProvider } from '../../src/lib/security';

describe('security barrel exports', () => {
  it('re-exports the SecurityProvider', () => {
    expect(SecurityProvider).toBeDefined();
  });
});
