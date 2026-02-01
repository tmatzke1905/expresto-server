import { getConfig } from '../../lib/config';

/**
 * Returns the currently active configuration in a form that is safe to expose.
 *
 * Notes:
 * - This endpoint is for operations/debugging.
 * - Secrets are redacted recursively (keys containing: secret, password, token, key).
 */
export function readPublicConfig(): unknown {
  const cfg = getConfig();
  return redactSecrets(cfg);
}

// ------------------------------------------------------------
// helpers
// ------------------------------------------------------------

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(v => redactSecrets(v));
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(obj)) {
      if (isSecretKey(k)) {
        out[k] = v == null ? v : '***';
      } else {
        out[k] = redactSecrets(v);
      }
    }

    return out;
  }

  return value;
}

function isSecretKey(key: string): boolean {
  return /(secret|password|token|key)/i.test(key);
}
