import type { ProviderName } from './types';

// Per-provider circuit breaker (Section C.6). None of the three routers found in the audit
// had one — this is a CREATE item. Closed -> Open after N consecutive failures; Open ->
// Half-open after a cooldown; one success in half-open closes it again.
export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerOptions {
  failure_threshold: number;
  cooldown_ms: number;
}

const DEFAULTS: BreakerOptions = { failure_threshold: 5, cooldown_ms: 30_000 };

interface ProviderState {
  consecutive_failures: number;
  opened_at: number | null;
}

export class CircuitBreaker {
  private states = new Map<ProviderName, ProviderState>();
  constructor(private options: BreakerOptions = DEFAULTS) {}

  private stateFor(provider: ProviderName): ProviderState {
    let s = this.states.get(provider);
    if (!s) { s = { consecutive_failures: 0, opened_at: null }; this.states.set(provider, s); }
    return s;
  }

  status(provider: ProviderName, now: number = Date.now()): BreakerState {
    const s = this.stateFor(provider);
    if (s.opened_at === null) return 'closed';
    if (now - s.opened_at >= this.options.cooldown_ms) return 'half_open';
    return 'open';
  }

  // A provider is skipped entirely while open; half-open lets exactly one probe through.
  allows(provider: ProviderName, now: number = Date.now()): boolean {
    return this.status(provider, now) !== 'open';
  }

  recordSuccess(provider: ProviderName): void {
    const s = this.stateFor(provider);
    s.consecutive_failures = 0;
    s.opened_at = null;
  }

  recordFailure(provider: ProviderName, now: number = Date.now()): void {
    const s = this.stateFor(provider);
    s.consecutive_failures += 1;
    if (s.consecutive_failures >= this.options.failure_threshold) {
      s.opened_at = now;
    }
  }
}
