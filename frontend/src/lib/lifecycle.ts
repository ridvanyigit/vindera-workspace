/**
 * Small helpers about where a unit is in its life. Mirrors backend/src/services/
 * lifecycle.py and inventory_alerts.py; the backend stays the authority.
 */

/** Statuses of units that physically exist (or are on their way) and can still go back to Amazon. */
export const HELD_STATUSES = ['bought', 'in_inventory', 'listed'];

export interface DealDates {
  status: string;
  created_at: string;
  purchased_at?: string | null;
  received_at?: string | null;
  return_by?: string | null;
}

export interface DealCosts {
  buy_price: number;
  purchase_price_actual?: number | null;
  inbound_shipping_cost?: number | null;
  packaging_cost?: number | null;
}

const DAY_MS = 86_400_000;

/** Full days a unit has been held: since it arrived, else was bought, else was scanned. Same basis as the dead-stock push. */
export function holdingDays(deal: DealDates, now: Date = new Date()): number {
  const start = deal.received_at || deal.purchased_at || deal.created_at;
  return Math.max(Math.floor((now.getTime() - new Date(start).getTime()) / DAY_MS), 0);
}

/** What the unit really cost: recorded purchase price (else the planned one) plus recorded inbound shipping and packaging. */
export function effectiveCost(deal: DealCosts): number {
  return Number(deal.purchase_price_actual ?? deal.buy_price) + Number(deal.inbound_shipping_cost ?? 0) + Number(deal.packaging_cost ?? 0);
}

export interface ReturnByBadge {
  daysLeft: number;
  tone: 'amber' | 'red';
  label: string;
}

/** Badge for the Amazon return deadline: amber when 7 days or less are left, red once it has passed. Null otherwise. */
export function returnByBadge(deal: DealDates, now: Date = new Date()): ReturnByBadge | null {
  if (!deal.return_by || !HELD_STATUSES.includes(deal.status)) return null;
  const deadline = new Date(`${deal.return_by}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((deadline.getTime() - today.getTime()) / DAY_MS);
  if (daysLeft < 0) return { daysLeft, tone: 'red', label: 'Return window closed' };
  if (daysLeft <= 7) return { daysLeft, tone: 'amber', label: daysLeft === 0 ? 'Return today' : `Return in ${daysLeft}d` };
  return null;
}

/** Return-by date for a purchase made on `purchasedOn` (yyyy-mm-dd), as yyyy-mm-dd. */
export function returnByDate(purchasedOn: string, windowDays: number): string {
  const date = new Date(`${purchasedOn}T00:00:00`);
  date.setDate(date.getDate() + windowDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Today as yyyy-mm-dd in the browser's time zone. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
