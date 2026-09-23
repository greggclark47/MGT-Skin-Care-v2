import type { BudgetClass } from './types';
import {randomUUID} from 'node:crypto';

export function checkedCents(value:number):number {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) throw new Error('invalid_budget_amount');
  return Math.ceil(value * 1_000_000) / 1_000_000;
}

// Per-user AI budgets (Section C.5/E.8). Enforced in the gateway, not at the route layer, so
// every caller — API, worker, admin tool — is subject to the same ceiling. The v1 KPI is AI
// cost <= $0.02/user; these caps are the hard stop well above that, sized so a normal user
// never sees them and an abusive one is cut off before the bill matters.
export interface BudgetCaps {
  per_user_daily_cents: Record<BudgetClass, number>;
}

export const DEFAULT_BUDGET_CAPS: BudgetCaps = {
  per_user_daily_cents: {
    tier1_copy: 25,
    tier2_vision: 15,
    tier3_premium: 150, // Premium only; entitlement gate already restricts who reaches it
    embedding: 10,
  },
};

export interface BudgetStore {
  // Returns cents already spent by this user in this budget class today.
  spentToday(userId: string, budgetClass: BudgetClass): Promise<number>;
  record(userId: string, budgetClass: BudgetClass, cents: number): Promise<void>;
  reserve(userId:string,budgetClass:BudgetClass,cents:number,limit:number):Promise<string|null>;
  settle(reservationId:string,actualCents:number):Promise<void>;
}

export class InMemoryBudgetStore implements BudgetStore {
  private spend = new Map<string, number>();
  private reservations = new Map<string,{key:string;cents:number;settled:boolean}>();
  private key(userId: string, budgetClass: BudgetClass) {
    return `${userId}:${budgetClass}:${new Date().toISOString().slice(0, 10)}`;
  }
  async spentToday(userId: string, budgetClass: BudgetClass): Promise<number> {
    return this.spend.get(this.key(userId, budgetClass)) ?? 0;
  }
  async record(userId: string, budgetClass: BudgetClass, cents: number): Promise<void> {
    cents=checkedCents(cents);
    const k = this.key(userId, budgetClass);
    this.spend.set(k, (this.spend.get(k) ?? 0) + cents);
  }
  async reserve(userId:string,budgetClass:BudgetClass,cents:number,limit:number):Promise<string|null>{
    cents=checkedCents(cents);limit=checkedCents(limit);
    const key=this.key(userId,budgetClass),spent=this.spend.get(key)??0;
    if(spent+cents>limit)return null;
    const id=randomUUID();
    // No await between read and write: atomic within this process only.
    this.spend.set(key,spent+cents);this.reservations.set(id,{key,cents,settled:false});
    return id;
  }
  async settle(id:string,actualCents:number):Promise<void>{
    actualCents=checkedCents(actualCents);
    const reservation=this.reservations.get(id);
    if(!reservation)throw new Error('budget_reservation_missing');
    if(reservation.settled)return;
    this.spend.set(reservation.key,Math.max(0,(this.spend.get(reservation.key)??0)-reservation.cents+actualCents));
    reservation.settled=true;
  }
}

export async function isWithinBudget(store: BudgetStore, caps: BudgetCaps, userId: string | null, budgetClass: BudgetClass): Promise<boolean> {
  if (userId === null) return true; // pre-account Skin Match sessions are rate-limited at the route layer instead
  const spent = await store.spentToday(userId, budgetClass);
  return spent < caps.per_user_daily_cents[budgetClass];
}
