import { createHash, randomUUID } from 'node:crypto';

export function stableId(prefix: string, parts: string[]): string {
  const hash = createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
  return `${prefix}-${hash}`;
}

export function randomId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
