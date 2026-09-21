import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFIT_SETTINGS,
  actualProfit,
  calculateProfit,
  profitSettingsFromRow,
  type ProfitSettings,
} from '../profit';

// The backend's pytest suite reads the very same file: the two implementations must not drift.
const VECTORS_PATH = fileURLToPath(new URL('../../../../backend/tests/data/profit_golden_vectors.json', import.meta.url));

interface Vector {
  name: string;
  input: { sell_price: number; purchase_price: number; inbound_shipping: number; packaging: number; outbound_shipping: number };
  settings: Record<string, number>;
  expected: {
    total_cost: number;
    platform_fees: number;
    payment_fees: number;
    return_reserve: number;
    net_profit: number;
    net_margin_pct: number;
    break_even_price: number | null;
    emergency_price: number;
    passes_guardrails: boolean;
  };
}

const vectors: Vector[] = JSON.parse(readFileSync(VECTORS_PATH, 'utf8')).vectors;

describe('golden vectors shared with the backend', () => {
  it('has enough cases', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(8);
  });

  it.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, vector) => {
    const settings = profitSettingsFromRow(vector.settings);
    const result = calculateProfit(
      {
        sellPrice: vector.input.sell_price,
        purchasePrice: vector.input.purchase_price,
        inboundShipping: vector.input.inbound_shipping,
        packaging: vector.input.packaging,
        outboundShipping: vector.input.outbound_shipping,
      },
      settings,
    );
    const e = vector.expected;
    expect(result.totalCost).toBe(e.total_cost);
    expect(result.platformFees).toBe(e.platform_fees);
    expect(result.paymentFees).toBe(e.payment_fees);
    expect(result.returnReserve).toBe(e.return_reserve);
    expect(result.netProfit).toBe(e.net_profit);
    expect(result.netMarginPct).toBe(e.net_margin_pct);
    expect(result.breakEvenPrice).toBe(e.break_even_price);
    expect(result.emergencyPrice).toBe(e.emergency_price);
    expect(result.passesGuardrails).toBe(e.passes_guardrails);
  });
});

describe('guardrails', () => {
  const guard: ProfitSettings = { ...DEFAULT_PROFIT_SETTINGS, packagingEur: 0, outboundShippingEur: 0, returnReservePct: 0 };

  it('accepts exactly the minimum margin and profit', () => {
    // cost 60, sell 75: profit 15.00, margin 25.00 %
    expect(calculateProfit({ sellPrice: 75, purchasePrice: 60 }, guard).passesGuardrails).toBe(true);
  });

  it('refuses one cent below the minimum profit', () => {
    expect(calculateProfit({ sellPrice: 74.99, purchasePrice: 60 }, guard).passesGuardrails).toBe(false);
  });

  it('refuses a good profit at a thin margin', () => {
    // profit 20 on a cost of 100: 20 %
    expect(calculateProfit({ sellPrice: 120, purchasePrice: 100 }, guard).passesGuardrails).toBe(false);
  });
});

describe('properties', () => {
  it('net profit never falls when the sell price rises', () => {
    const settings: ProfitSettings = { ...DEFAULT_PROFIT_SETTINGS, platformFeePct: 8, paymentFeePct: 2.5, platformFeeFixedEur: 0.5 };
    let previous = -Infinity;
    for (let price = 0; price < 400; price += 7) {
      const net = calculateProfit({ sellPrice: price, purchasePrice: 30 }, settings).netProfit;
      expect(net).toBeGreaterThanOrEqual(previous);
      previous = net;
    }
  });

  it('the emergency price is never below break-even', () => {
    const settings: ProfitSettings = { ...DEFAULT_PROFIT_SETTINGS, platformFeePct: 12, returnReservePct: 5 };
    for (const sell of [30, 45, 60, 99.99, 250]) {
      const result = calculateProfit({ sellPrice: sell, purchasePrice: 28 }, settings);
      expect(result.emergencyPrice).toBeGreaterThanOrEqual(result.breakEvenPrice ?? 0);
    }
  });

  it('per-deal costs override the settings defaults', () => {
    const custom = calculateProfit({ sellPrice: 60, purchasePrice: 20, inboundShipping: 2, packaging: 1, outboundShipping: 0 });
    expect(custom.totalCost).toBe(23);
    expect(custom.outboundShipping).toBe(0);
  });
});

describe('actual profit of a recorded sale', () => {
  it('matches the manual test scenario (docs/MANUAL-TEST-SCRIPT.md 3.2)', () => {
    const outcome = actualProfit({ saleAmount: 60, purchasePrice: 20, inboundShipping: 2, packaging: 1, shippingCost: 6.9 });
    expect(outcome).toEqual({ totalCost: 23, netProfit: 30.1, netMarginPct: 130.87 });
  });

  it('counts unrecorded costs as zero and survives a zero cost', () => {
    expect(actualProfit({ saleAmount: 50, purchasePrice: 10 }).netProfit).toBe(40);
    expect(actualProfit({ saleAmount: 5, purchasePrice: 0 }).netMarginPct).toBeNull();
  });
});

describe('profitSettingsFromRow', () => {
  it('reads numeric strings from PostgREST and keeps defaults for missing keys', () => {
    const settings = profitSettingsFromRow({ platform_fee_pct: '5.5', packaging_eur: null, return_reserve_pct: '' });
    expect(settings.platformFeePct).toBe(5.5);
    expect(settings.packagingEur).toBe(DEFAULT_PROFIT_SETTINGS.packagingEur);
    expect(settings.returnReservePct).toBe(DEFAULT_PROFIT_SETTINGS.returnReservePct);
  });
});
