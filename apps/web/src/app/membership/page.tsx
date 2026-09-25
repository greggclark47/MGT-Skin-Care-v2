'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { BillingActivity } from '../../components/BillingActivity';
import { hub, useHub } from '../../lib/hub';
import { AppFrame, LoadState } from '../../components/HubFrames';

export default function Membership() {
  const [audience, setAudience] = useState('consumer');
  const [cycle, setCycle] = useState('monthly');
  const [notice, setNotice] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const state = useHub('/billing?audience=' + audience + '&cycle=' + cycle);
  const session = useHub('/session');
  const data = state.data?.audience === audience && state.data?.cycle === cycle ? state.data : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('audience') === 'vendor') setAudience('vendor');
    if (params.get('cycle') === 'annual') setCycle('annual');
    if (!params.has('checkout') && !params.has('billing')) return;
    setNotice('Checking for confirmed billing updates. This may take a moment.');
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      state.reload();
      attempts++;
      if (attempts >= 6) {
        window.clearInterval(timer);
        setNotice('Automatic refresh finished. Review the status below or refresh again if the billing service is still confirming your update.');
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [state.reload]);

  async function billing(action: string) {
    setBusy(true);
    setError('');
    try {
      const result = await hub('/billing/' + action, { audience, cycle, recurring_consent: consent });
      if (action === 'discard-checkout') {
        setNotice('Unfinished checkout discarded. Choose your billing cycle and continue.');
        setConsent(false);
        state.reload();
        setBusy(false);
        return;
      }
      if (action === 'trial-cycle') {
        setNotice('Billing cycle updated. Your original trial end date is unchanged. Refresh status after confirmation.');
        state.reload();
        setBusy(false);
        return;
      }
      const url = new URL(result.url);
      if (url.protocol !== 'https:') throw Error('Billing returned an invalid destination.');
      window.location.assign(url.href);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  }

  return <AppFrame title="Plans & Billing">
    <p className="lead">Subscriptions for personal care and vendor participation.</p>
    <p>Plan benefits and prices are being finalized. Retail purchases remain with external retailers.</p>
    <fieldset className="filters flow-fieldset" disabled={busy} aria-describedby={error ? 'membership-error' : undefined}><legend className="sr-only">Subscription audience</legend>
      {['consumer', 'vendor'].map(item => <button type="button" key={item} aria-pressed={audience === item} onClick={() => { setAudience(item); setConsent(false); setError(''); }}>
        {item === 'consumer' ? 'Consumer plans' : 'Vendor plans'}
      </button>)}
    </fieldset>
    <fieldset className="filters flow-fieldset" disabled={busy} aria-describedby={error ? 'membership-error' : undefined}><legend className="sr-only">Billing cycle</legend>
      {['monthly', 'annual'].map(item => <button type="button" key={item} aria-pressed={cycle === item} onClick={() => { setCycle(item); setConsent(false); setNotice(''); setError(''); }}>
        {item === 'monthly' ? 'Monthly' : 'Annual'}
      </button>)}
    </fieldset>
    <p className="notice">Start with a 14-day trial. Add your payment method now; subscription billing starts when the trial ends. Cancel before then to avoid the first subscription charge. Returning subscribers who have already used a trial are billed without a new trial.</p>
    {notice && <p className="notice success" role="status">{notice}</p>}
    <LoadState {...state} retry={state.reload} />
    {error && <p id="membership-error" className="notice error" role="alert">{error}</p>}
    {data && <section className="panel" aria-busy={busy} aria-describedby={error ? 'membership-error' : undefined}>
      <span className="eyebrow">{audience.toUpperCase()} SUBSCRIPTION</span>
      <h2>{data.plan ? new Intl.NumberFormat(undefined, { style: 'currency', currency: data.plan.currency }).format(data.plan.amount / 100) + ' ' + data.plan.currency.toUpperCase() + (data.plan.interval === 'year' ? ' billed annually' : ' billed monthly') : 'Pricing TBD'}</h2>
      {data.subscription?.trial_end && <p>Trial ends: {new Date(data.subscription.trial_end * 1000).toLocaleString()}</p>}
      {data.subscription?.current_period_end && <p>{data.subscription.cancel_at_period_end ? 'Service ends' : 'Current period ends'}: {new Date(data.subscription.current_period_end * 1000).toLocaleString()}</p>}
      <p>Cancellation takes effect at the end of the current billing period. Paid plan changes may incur prorated charges; review them in the billing service before confirming.</p>
      {data.subscription && <p role="status" aria-live="polite" aria-atomic="true">Status: <strong>{({ trialing: 'Trial active', active: 'Active', past_due: 'Payment overdue', unpaid: 'Payment required', canceled: 'Ended', incomplete: 'Payment incomplete', incomplete_expired: 'Signup expired', paused: 'Paused' } as Record<string, string>)[data.subscription.status] || data.subscription.status}</strong>{data.subscription.cancel_at_period_end ? ' · Cancels at period end' : ''}</p>}
      {['past_due', 'unpaid', 'incomplete'].includes(data.subscription?.status) && <p className="notice error">Your subscription needs payment attention. Use Manage billing to review your payment details.</p>}
      {data.subscription?.cancel_at_period_end && <p className="notice">Renewal is turned off. Service continues until the end date shown above.</p>}
      {!data.configured && <p className="notice">Payment setup is not active. No subscription can be purchased yet.</p>}
      <p>Returning from the billing service does not activate a subscription until the payment service confirms its status.</p>
      <button className="text-button" onClick={state.reload}>Refresh billing status</button>
      {!session.data?.account ? <Link className="button" href="/account">Sign in to manage subscriptions</Link> : <>
        {data.pending_checkout && <div className="notice"><p>You have an unfinished checkout. Discard it before choosing a different billing cycle. This does not cancel an active subscription.</p><button className="button" disabled={busy} onClick={() => void billing('discard-checkout')}>Discard unfinished checkout</button></div>}
        {data.can_manage && <button className="button" disabled={busy || !data.configured} onClick={() => void billing('portal')}>Manage billing</button>}
        {((!data.subscription?.status || ['canceled', 'incomplete_expired'].includes(data.subscription.status)) || (data.subscription?.status === 'trialing' && !data.subscription.cancel_at_period_end)) && <>
          <label className="check-label"><input type="checkbox" checked={consent} disabled={!data.configured || busy} onChange={event => setConsent(event.target.checked)} />I agree to the displayed recurring rate after my eligible trial ends, and to the subscription terms.</label>
          <div className="actions"><Link className="text-link" href="/terms">Read terms</Link><button className="button primary" disabled={busy || !consent || !data.configured} onClick={() => void billing(data.subscription?.status === 'trialing' ? 'trial-cycle' : 'checkout')}>{busy ? 'Please wait…' : data.subscription?.status === 'trialing' ? 'Change cycle for after trial' : data.trial_eligible ? 'Start 14-day trial' : 'Continue to billing'}</button></div>
        </>}
      </>}
    </section>}
    {session.data?.account && <BillingActivity key={audience} audience={audience} />}
  </AppFrame>;
}
