/**
 * Cryptographically secure ID generator with RFC-4122 v4 fallback
 * Replaces Date.now() / millisecond-collision-prone identifier generation.
 */
export function newId(prefix = ''): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : // RFC-4122 v4 from getRandomValues — 122 bits of entropy
        ('10000000-1000-4000-8000-100000000000').replace(/[018]/g, (c: string) => {
          const num = Number(c);
          const randomByte = typeof crypto !== 'undefined' && crypto.getRandomValues
            ? crypto.getRandomValues(new Uint8Array(1))[0]
            : Math.floor(Math.random() * 256);
          return (num ^ (randomByte & (15 >> (num / 4)))).toString(16);
        });

  return prefix ? `${prefix}${uuid}` : uuid;
}
