import { AnalyticsClient, type AnalyticsEvent, type Transport } from '../client';
import { EVENT_REGISTRY } from '../taxonomy';

let failures = 0;
function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.log(`  FAIL  ${label}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

class CapturingTransport implements Transport {
  batches: AnalyticsEvent[][] = [];
  failNext = false;
  async send(events: AnalyticsEvent[]) {
    if (this.failNext) { this.failNext = false; throw new Error('network_down'); }
    this.batches.push(events);
  }
}

async function main() {
  console.log('\n== 1. Unknown and malformed events are rejected at definition time ==');
  {
    const t = new CapturingTransport();
    const c = new AnalyticsClient({ anonymousId: 'anon-1', transport: t });
    const invalidName = c.track(null as unknown as string);
    check('invalid event name rejected', invalidName.accepted === false && invalidName.reason === 'invalid_event_name', invalidName);
    const invalidProperties = c.track('routine.viewed', null as unknown as Record<string, unknown>);
    check('invalid property shape rejected', invalidProperties.accepted === false && invalidProperties.reason === 'invalid_properties', invalidProperties);
    const unknown = c.track('made.up.event');
    check('unknown event rejected', unknown.accepted === false && unknown.reason === 'unknown_event:made.up.event', unknown);
    const missing = c.track('purchase.completed', { order_id: 'o1' }); // total_cents missing
    check('missing required property rejected', missing.accepted === false && missing.reason === 'missing_property:total_cents', missing);
    const undefinedRequired = c.track('purchase.completed', { order_id: 'o1', total_cents: undefined });
    check('undefined required property rejected', undefinedRequired.accepted === false && undefinedRequired.reason === 'missing_property:total_cents', undefinedRequired);
    const good = c.track('purchase.completed', { order_id: 'o1', total_cents: 4500 });
    check('valid event accepted', good.accepted === true);
  }

  console.log('\n== 2. Privacy/retention class is stamped from the registry, not the caller ==');
  {
    const t = new CapturingTransport();
    const c = new AnalyticsClient({ anonymousId: 'anon-2', transport: t });
    c.track('photo.analyzed', { duration_ms: 800, privacy_class: 'pub' }); // caller tries to claim 'pub'
    await c.flush();
    const ev = t.batches[0][0];
    check('sensitive class enforced by registry', ev.privacy_class === 'sen', ev.privacy_class);
    check('shortest retention enforced for photo', ev.retention_class === 'd30', ev.retention_class);
  }

  console.log('\n== 3. Identity stitching back-fills queued pre-signup events ==');
  {
    const t = new CapturingTransport();
    const c = new AnalyticsClient({ anonymousId: 'anon-3', transport: t });
    c.track('skin_match.started');
    c.track('skin_match.completed', { duration_ms: 71000 });
    check('queued events have no user yet', c.pendingCount() === 2);
    c.identify('user-77');
    c.track('purchase.completed', { order_id: 'o2', total_cents: 5200 });
    await c.flush();
    const all = t.batches[0];
    check('all events attributed to the user after identify', all.every((e) => e.user_id === 'user-77'), all.map((e) => e.user_id));
    check('anonymous id preserved for stitching', all.every((e) => e.anonymous_id === 'anon-3'));
  }

  console.log('\n== 4. Batching flushes at batchSize ==');
  {
    const t = new CapturingTransport();
    const c = new AnalyticsClient({ anonymousId: 'anon-4', transport: t, batchSize: 3 });
    c.track('routine.viewed'); c.track('routine.viewed'); c.track('routine.viewed');
    await new Promise((r) => setImmediate(r));
    check('auto-flushed at batch size', t.batches.length === 1 && t.batches[0].length === 3, t.batches.map((b) => b.length));
  }

  console.log('\n== 5. Transport failure re-queues in order and never throws ==');
  {
    const t = new CapturingTransport();
    const c = new AnalyticsClient({ anonymousId: 'anon-5', transport: t, onError: () => {} });
    c.track('cart.created');
    t.failNext = true;
    await c.flush();
    check('events retained after failure', c.pendingCount() === 1, c.pendingCount());
    c.track('checkout.started');
    await c.flush();
    check('delivered on retry', t.batches.length === 1 && t.batches[0].length === 2, t.batches.map((b) => b.length));
    check('original order preserved', t.batches[0][0].name === 'cart.created', t.batches[0].map((e) => e.name));
  }

  console.log('\n== 6. Every registry entry is fully classified ==');
  {
    const bad = Object.values(EVENT_REGISTRY).filter((d) => !d.privacy_class || !d.retention_class || !d.purpose);
    check('no event lacks privacy/retention/purpose', bad.length === 0, bad.map((b) => b.name));
    const coachContent = EVENT_REGISTRY['coach.message_sent'].required_properties;
    check('coach events never require message content', !coachContent.some((p) => /text|message|content|body/.test(p)), coachContent);
    const supportEvents = Object.values(EVENT_REGISTRY).filter((event) => event.name.startsWith('support.'));
    check('support events are aggregate-only', supportEvents.length === 6 && supportEvents.every((event) => event.retention_class === 'agg'), supportEvents);
    check('support events never require customer content', supportEvents.every((event) => !event.required_properties.some((property) => /text|message|content|body|email|account|user/.test(property))), supportEvents);
    const retailerEvents = Object.values(EVENT_REGISTRY).filter((event) => event.name.startsWith('retailer.'));
    check('retailer events are aggregate-only', retailerEvents.length === 2 && retailerEvents.every((event) => event.retention_class === 'agg'), retailerEvents);
    check('retailer events contain no customer or transaction fields', retailerEvents.every((event) => !event.required_properties.some((property) => /user|account|email|profile|order|amount|revenue|profit|search/.test(property))), retailerEvents);
  }

  console.log(failures === 0 ? '\nANALYTICS SDK: ALL CHECKS PASSED' : `\nANALYTICS SDK: ${failures} CHECK(S) FAILED`);
  if (failures > 0) process.exitCode = 1;
}
main();
