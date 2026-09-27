import { getEventDefinition, type PrivacyClass, type RetentionClass } from './taxonomy';

// Client SDK (Section H SC-P1 analytics track): batching emitter to
// POST /api/analytics/events, with identity stitching on signup.

export interface AnalyticsEvent {
  name: string;
  properties: Record<string, unknown>;
  anonymous_id: string;
  user_id: string | null;
  privacy_class: PrivacyClass;
  retention_class: RetentionClass;
  occurred_at: string;
}

export interface Transport {
  send(events: AnalyticsEvent[]): Promise<void>;
}

export interface ClientOptions {
  anonymousId: string;
  transport: Transport;
  batchSize?: number;
  flushIntervalMs?: number;
  onError?: (err: unknown) => void;
  now?: () => Date;
}

export class AnalyticsClient {
  private queue: AnalyticsEvent[] = [];
  private userId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly batchSize: number;
  private readonly now: () => Date;

  constructor(private options: ClientOptions) {
    this.batchSize = options.batchSize ?? 20;
    this.now = options.now ?? (() => new Date());
    if (options.flushIntervalMs) {
      this.timer = setInterval(() => { void this.flush(); }, options.flushIntervalMs);
      // Never hold the process open just to flush analytics.
      if (typeof this.timer === 'object' && this.timer && 'unref' in this.timer) (this.timer as any).unref();
    }
  }

  // Identity stitching (Section D): on signup, the anonymous id is bound to the user id.
  // Events ALREADY queued are back-filled so the pre-signup part of the funnel is attributed
  // to the same person — that stitch is the whole reason the funnel numbers are trustworthy.
  identify(userId: string): void {
    this.userId = userId;
    for (const event of this.queue) {
      if (event.user_id === null) event.user_id = userId;
    }
  }

  track(name: string, properties: Record<string, unknown> = {}): { accepted: boolean; reason?: string } {
    if (!name || typeof name !== 'string') return { accepted: false, reason: 'invalid_event_name' };
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
      return { accepted: false, reason: 'invalid_properties' };
    }
    const definition = getEventDefinition(name);
    // An undefined event is rejected rather than passed through: an unclassified event is an
    // undocumented data stream, which is exactly what §11 forbids.
    if (!definition) return { accepted: false, reason: `unknown_event:${name}` };

    for (const required of definition.required_properties) {
      if (!(required in properties) || properties[required] === undefined || properties[required] === null) {
        return { accepted: false, reason: `missing_property:${required}` };
      }
    }

    this.queue.push({
      name,
      properties,
      anonymous_id: this.options.anonymousId,
      user_id: this.userId,
      privacy_class: definition.privacy_class,
      retention_class: definition.retention_class,
      occurred_at: this.now().toISOString(),
    });

    if (this.queue.length >= this.batchSize) void this.flush();
    return { accepted: true };
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    try {
      await this.options.transport.send(batch);
    } catch (err) {
      // Re-queue at the FRONT so ordering survives a transient failure. Analytics must never
      // throw into product code — a dropped metric is acceptable, a broken checkout is not.
      this.queue = [...batch, ...this.queue];
      this.options.onError?.(err);
    }
  }

  pendingCount(): number { return this.queue.length; }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}
