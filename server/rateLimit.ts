/**
 * server/rateLimit.ts
 *
 * In-Memory Token Bucket Rate Limiting
 */

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

export class TokenBucketRateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private capacity: number;
  private refillPerSecond: number;

  constructor(capacity: number, refillPerMinute: number) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerMinute / 60;
  }

  tryConsume(key: string, tokens = 1): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      const elapsedSeconds = (now - bucket.lastRefill) / 1000;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return { allowed: true };
    }

    const missingTokens = tokens - bucket.tokens;
    const retryAfterSeconds = Math.ceil(missingTokens / this.refillPerSecond);
    return { allowed: false, retryAfterSeconds };
  }
}
