import path from 'node:path';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options';

export type RegisteredRoute = {
  method: HttpMethod;
  path: string; // vollständiger, montierter Pfad (inkl. contextRoot + controller.route + handler.path)
  secure: 'basic' | 'jwt' | 'none';
  source: string; // Controller-Dateiname
};

export class RouteRegistry {
  private readonly routes: RegisteredRoute[] = [];

  register(entry: RegisteredRoute): void {
    // Normalize: lower-case method, posix style path
    const norm: RegisteredRoute = {
      method: entry.method.toLowerCase() as HttpMethod,
      path: path.posix.normalize(entry.path),
      secure: entry.secure,
      source: entry.source,
    };
    this.routes.push(norm);
  }

  getRoutes(): RegisteredRoute[] {
    return [...this.routes];
  }

  getSorted(): RegisteredRoute[] {
    return [...this.routes].sort((a, b) => {
      if (a.method !== b.method) return a.method.localeCompare(b.method);
      if (a.path !== b.path) return a.path.localeCompare(b.path);
      return a.secure.localeCompare(b.secure);
    });
  }

  /**
   * Findet potentielle Konflikte: identischer (method, path) mehrfach registriert.
   * Gibt beschreibende Meldungen zurück (für Logging & Metriken).
   */
  detectConflicts(): string[] {
    const msgs: string[] = [];
    const seen = new Map<string, RegisteredRoute[]>();

    for (const r of this.routes) {
      const key = `${r.method} ${r.path}`;
      const list = seen.get(key) || [];
      list.push(r);
      seen.set(key, list);
    }

    for (const [key, list] of seen.entries()) {
      if (list.length > 1) {
        const sources = list.map(r => `${r.source}(${r.secure})`).join(', ');
        msgs.push(`Route conflict for [${key}] in: ${sources}`);
      }
    }
    return msgs;
  }
}

export const routeRegistry = new RouteRegistry();
