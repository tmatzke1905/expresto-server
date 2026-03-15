import { beforeEach, describe, expect, it } from 'vitest';
import { RouteRegistry } from '../../../src/lib/routing/route-registry';

describe('RouteRegistry', () => {
  let registry: RouteRegistry;

  beforeEach(() => {
    registry = new RouteRegistry();
  });

  it('normalizes method casing and paths on registration', () => {
    registry.register({
      method: 'GET' as any,
      path: '/api//users/../users/42/',
      secure: 'jwt',
      source: 'users.ts',
    });

    expect(registry.getRoutes()).toEqual([
      {
        method: 'get',
        path: '/api/users/42/',
        secure: 'jwt',
        source: 'users.ts',
      },
    ]);
  });

  it('returns defensive copies from getRoutes', () => {
    registry.register({
      method: 'get',
      path: '/api/secure',
      secure: 'basic',
      source: 'auth.ts',
    });

    const routes = registry.getRoutes();
    routes.push({
      method: 'post',
      path: '/api/hacked',
      secure: 'none',
      source: 'evil.ts',
    });

    expect(registry.getRoutes()).toHaveLength(1);
  });

  it('sorts by method, path, and security mode', () => {
    registry.register({ method: 'post', path: '/b', secure: 'none', source: 'a.ts' });
    registry.register({ method: 'get', path: '/b', secure: 'jwt', source: 'b.ts' });
    registry.register({ method: 'get', path: '/a', secure: 'basic', source: 'c.ts' });
    registry.register({ method: 'get', path: '/a', secure: 'none', source: 'd.ts' });

    expect(registry.getSorted()).toEqual([
      { method: 'get', path: '/a', secure: 'basic', source: 'c.ts' },
      { method: 'get', path: '/a', secure: 'none', source: 'd.ts' },
      { method: 'get', path: '/b', secure: 'jwt', source: 'b.ts' },
      { method: 'post', path: '/b', secure: 'none', source: 'a.ts' },
    ]);
  });

  it('detects conflicts for the same method and normalized path', () => {
    registry.register({ method: 'get', path: '/api/items/', secure: 'none', source: 'a.ts' });
    registry.register({ method: 'get', path: '/api/items//', secure: 'jwt', source: 'b.ts' });

    expect(registry.detectConflicts()).toEqual([
      'Route conflict for [get /api/items/] in: a.ts(none), b.ts(jwt)',
    ]);
  });

  it('ignores unique routes and different methods', () => {
    registry.register({ method: 'get', path: '/api/items', secure: 'none', source: 'a.ts' });
    registry.register({ method: 'post', path: '/api/items', secure: 'none', source: 'b.ts' });
    registry.register({ method: 'get', path: '/api/items/:id', secure: 'jwt', source: 'c.ts' });

    expect(registry.detectConflicts()).toEqual([]);
  });
});
