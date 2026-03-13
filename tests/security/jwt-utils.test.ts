import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../../src/lib/security/jwt';

describe('jwt helpers', () => {
  it('signs and verifies tokens with an explicit algorithm and expiration', async () => {
    const token = await signToken({ sub: 'user-1', scope: 'read' }, 'super-secret', 'hs256', '1h');
    const payload = await verifyToken<{ sub: string; scope: string; exp: number }>(
      token,
      'super-secret',
      'HS256'
    );

    expect(payload.sub).toBe('user-1');
    expect(payload.scope).toBe('read');
    expect(typeof payload.exp).toBe('number');
  });

  it('falls back to HS512 for unsupported algorithms', async () => {
    const token = await signToken({ sub: 'fallback-user' }, 'super-secret', 'not-supported');
    const payload = await verifyToken<{ sub: string }>(token, 'super-secret', 'still-not-supported');

    expect(payload.sub).toBe('fallback-user');
  });

  it('rejects verification when the secret is wrong', async () => {
    const token = await signToken({ sub: 'user-1' }, 'super-secret', 'HS384');

    await expect(verifyToken(token, 'wrong-secret', 'HS384')).rejects.toThrow();
  });
});
