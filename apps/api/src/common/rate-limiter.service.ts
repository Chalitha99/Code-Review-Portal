import { Injectable } from '@nestjs/common';

/**
 * Sliding-window request counter for the public auth endpoints (sign-in,
 * refresh, password links).
 *
 * In memory, so it is per process: correct for the single API instance this
 * project runs today. With more than one instance, replace the map with a
 * shared store (Redis `INCR` + `EXPIRE`) behind the same two methods. Per-IP
 * keys rely on Express `trust proxy` being set to the real proxy depth
 * (`TRUST_PROXY`), or every caller shares the load balancer's address.
 */
@Injectable()
export class RateLimiterService {
  private readonly hits = new Map<string, number[]>();

  /**
   * Records one attempt under `key`. Returns `false` — and records nothing —
   * when `limit` attempts already happened inside the window.
   */
  consume(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    this.prune(now, windowMs);
    return true;
  }

  /** Clears one key, e.g. an account's failed sign-ins after a successful one. */
  forget(key: string): void {
    this.hits.delete(key);
  }

  /** Test seam and admin escape hatch. */
  reset(): void {
    this.hits.clear();
  }

  /** Keeps the map from growing without bound under a spray of distinct keys. */
  private prune(now: number, windowMs: number): void {
    if (this.hits.size < 10_000) return;
    for (const [key, times] of this.hits) {
      if (times.every((at) => now - at >= windowMs)) this.hits.delete(key);
    }
  }
}
