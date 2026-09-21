import { describe, expect, it } from 'vitest';
import { effectiveCost, holdingDays, returnByBadge, returnByDate, type DealDates } from '../lifecycle';

// Local noon, so the tests do not depend on the machine's time zone or on daylight saving.
const NOW = new Date(2026, 8, 21, 12, 0, 0);
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

const deal = (overrides: Partial<DealDates> = {}): DealDates => ({ status: 'listed', created_at: iso(100), ...overrides });

describe('holdingDays', () => {
  it('counts from receipt, then purchase, then the scan', () => {
    expect(holdingDays(deal({ received_at: iso(70), purchased_at: iso(90) }), NOW)).toBe(70);
    expect(holdingDays(deal({ purchased_at: iso(90) }), NOW)).toBe(90);
    expect(holdingDays(deal(), NOW)).toBe(100);
  });

  it('never goes negative', () => {
    expect(holdingDays(deal({ received_at: iso(-3) }), NOW)).toBe(0);
  });
});

describe('effectiveCost', () => {
  it('uses the price actually paid plus recorded extras, else the planned price', () => {
    expect(effectiveCost({ buy_price: 20, purchase_price_actual: 22, inbound_shipping_cost: 2, packaging_cost: 1 })).toBe(25);
    expect(effectiveCost({ buy_price: 20 })).toBe(20);
    expect(effectiveCost({ buy_price: 20, purchase_price_actual: null, packaging_cost: 1.5 })).toBe(21.5);
  });
});

describe('returnByBadge', () => {
  const at = (days: number, status = 'listed') => deal({ status, return_by: returnByDate('2026-09-21', days) });

  it('is amber within seven days and red once the window has closed', () => {
    expect(returnByBadge(at(0), NOW)).toMatchObject({ tone: 'amber', label: 'Return today', daysLeft: 0 });
    expect(returnByBadge(at(7), NOW)).toMatchObject({ tone: 'amber', daysLeft: 7 });
    expect(returnByBadge(at(-1), NOW)).toMatchObject({ tone: 'red', label: 'Return window closed' });
  });

  it('stays quiet while there is time, for units that are gone, and without a date', () => {
    expect(returnByBadge(at(8), NOW)).toBeNull();
    expect(returnByBadge(at(3, 'sold'), NOW)).toBeNull();
    expect(returnByBadge(at(3, 'cancelled'), NOW)).toBeNull();
    expect(returnByBadge(deal(), NOW)).toBeNull();
  });
});

describe('returnByDate', () => {
  it('adds the window to the purchase day, across month and year ends', () => {
    expect(returnByDate('2026-09-21', 30)).toBe('2026-10-21');
    expect(returnByDate('2026-12-15', 30)).toBe('2027-01-14');
    expect(returnByDate('2026-02-01', 28)).toBe('2026-03-01');
  });
});
