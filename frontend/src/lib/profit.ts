/**
 * Live profit preview. Port of backend/src/services/profit_calculator.py.
 *
 * This is ONLY for previews while typing. The backend recomputes and stores its
 * own figures on every save; both must agree with
 * backend/tests/data/profit_golden_vectors.json.
 *
 * All arithmetic is done in integer cents (percentages in hundredths of a
 * percent) so rounding is exactly the backend's: half away from zero, each fee
 * rounded to the cent before it is used in the next step.
 */

export interface ProfitSettings {
  outboundShippingEur: number;
  packagingEur: number;
  inboundShippingEur: number;
  platformFeePct: number;
  platformFeeFixedEur: number;
  paymentFeePct: number;
  returnReservePct: number;
  minNetMarginPct: number;
  minNetProfitEur: number;
}

/** Placeholder defaults, identical to the business_settings migration. Replace with the real row when loaded. */
export const DEFAULT_PROFIT_SETTINGS: ProfitSettings = {
  outboundShippingEur: 6.9,
  packagingEur: 1.5,
  inboundShippingEur: 0,
  platformFeePct: 0,
  platformFeeFixedEur: 0,
  paymentFeePct: 0,
  returnReservePct: 3,
  minNetMarginPct: 25,
  minNetProfitEur: 15,
};

export interface ProfitInput {
  sellPrice: number;
  purchasePrice: number;
  /** Per-deal overrides; the settings default is used when undefined. */
  inboundShipping?: number;
  packaging?: number;
  outboundShipping?: number;
}

export interface ProfitResult {
  sellPrice: number;
  totalCost: number;
  outboundShipping: number;
  platformFees: number;
  paymentFees: number;
  returnReserve: number;
  netProfit: number;
  /** Margin on cost (net profit / total cost), percent. */
  netMarginPct: number;
  /** null: variable fees are 100% or more of the price, so no price breaks even. */
  breakEvenPrice: number | null;
  emergencyPrice: number;
  passesGuardrails: boolean;
}

const EMERGENCY_PRICE_PERCENT = 85;

const toCents = (euro: number): number => Math.round(euro * 100);
const toHundredths = (pct: number): number => Math.round(pct * 100);

/** Integer division rounded half away from zero (d must be positive). */
function divRound(n: number, d: number): number {
  const q = Math.floor((Math.abs(n) * 2 + d) / (2 * d));
  return n < 0 ? -q : q;
}

/** ceil(n / d) for positive integers. */
const divCeil = (n: number, d: number): number => Math.floor((n + d - 1) / d);

/** amount (cents) * pct (hundredths of a percent) -> cents. */
const percentOf = (cents: number, pctHundredths: number): number => divRound(cents * pctHundredths, 10000);

export function calculateProfit(input: ProfitInput, settings: ProfitSettings = DEFAULT_PROFIT_SETTINGS): ProfitResult {
  const sell = toCents(input.sellPrice);
  const purchase = toCents(input.purchasePrice);
  const inbound = toCents(input.inboundShipping ?? settings.inboundShippingEur);
  const packaging = toCents(input.packaging ?? settings.packagingEur);
  const outbound = toCents(input.outboundShipping ?? settings.outboundShippingEur);

  const platformPct = toHundredths(settings.platformFeePct);
  const paymentPct = toHundredths(settings.paymentFeePct);
  const reservePct = toHundredths(settings.returnReservePct);
  const platformFixed = toCents(settings.platformFeeFixedEur);

  const totalCost = purchase + inbound + packaging;
  const platformFees = percentOf(sell, platformPct) + platformFixed;
  const paymentFees = percentOf(sell, paymentPct);
  const returnReserve = percentOf(sell, reservePct);
  const netProfit = sell - totalCost - outbound - platformFees - paymentFees - returnReserve;
  // Percent with two decimals, as hundredths: net / cost * 100 * 100.
  const marginHundredths = totalCost > 0 ? divRound(netProfit * 10000, totalCost) : 0;

  const rateHundredths = platformPct + paymentPct + reservePct;
  let breakEven: number | null = null;
  if (rateHundredths < 10000 && totalCost > 0) {
    const netAt = (price: number): number =>
      price - totalCost - outbound - (percentOf(price, platformPct) + platformFixed) - percentOf(price, paymentPct) - percentOf(price, reservePct);
    breakEven = divCeil((totalCost + outbound + platformFixed) * 10000, 10000 - rateHundredths);
    while (netAt(breakEven) < 0) breakEven += 1;
  }

  const ratioPrice = divRound(sell * EMERGENCY_PRICE_PERCENT, 100);
  const emergency = breakEven === null ? ratioPrice : Math.max(ratioPrice, breakEven);

  const passes =
    totalCost > 0 &&
    marginHundredths >= toHundredths(settings.minNetMarginPct) &&
    netProfit >= toCents(settings.minNetProfitEur);

  return {
    sellPrice: sell / 100,
    totalCost: totalCost / 100,
    outboundShipping: outbound / 100,
    platformFees: platformFees / 100,
    paymentFees: paymentFees / 100,
    returnReserve: returnReserve / 100,
    netProfit: netProfit / 100,
    netMarginPct: marginHundredths / 100,
    breakEvenPrice: breakEven === null ? null : breakEven / 100,
    emergencyPrice: emergency / 100,
    passesGuardrails: passes,
  };
}

export interface ActualProfitInput {
  saleAmount: number;
  purchasePrice: number;
  /** Costs that were never recorded count as zero, exactly like the backend's `actual_profit`. */
  inboundShipping?: number | null;
  packaging?: number | null;
  shippingCost?: number | null;
  platformFees?: number | null;
}

export interface ActualProfitResult {
  totalCost: number;
  netProfit: number;
  /** null when the recorded cost is zero. */
  netMarginPct: number | null;
}

/** Profit of a unit that was really sold. Preview only: the backend computes and stores the real figure. */
export function actualProfit(input: ActualProfitInput): ActualProfitResult {
  const totalCost = toCents(input.purchasePrice) + toCents(input.inboundShipping ?? 0) + toCents(input.packaging ?? 0);
  const net = toCents(input.saleAmount) - totalCost - toCents(input.shippingCost ?? 0) - toCents(input.platformFees ?? 0);
  return {
    totalCost: totalCost / 100,
    netProfit: net / 100,
    netMarginPct: totalCost > 0 ? divRound(net * 10000, totalCost) / 100 : null,
  };
}

/** Maps a `business_settings` row (snake_case, as PostgREST returns it) to `ProfitSettings`. */
export function profitSettingsFromRow(row: Record<string, unknown>): ProfitSettings {
  const num = (key: string, fallback: number): number => {
    const value = row[key];
    return typeof value === 'number' ? value : value != null && value !== '' ? Number(value) : fallback;
  };
  const d = DEFAULT_PROFIT_SETTINGS;
  return {
    outboundShippingEur: num('outbound_shipping_eur', d.outboundShippingEur),
    packagingEur: num('packaging_eur', d.packagingEur),
    inboundShippingEur: num('inbound_shipping_eur', d.inboundShippingEur),
    platformFeePct: num('platform_fee_pct', d.platformFeePct),
    platformFeeFixedEur: num('platform_fee_fixed_eur', d.platformFeeFixedEur),
    paymentFeePct: num('payment_fee_pct', d.paymentFeePct),
    returnReservePct: num('return_reserve_pct', d.returnReservePct),
    minNetMarginPct: num('min_net_margin_pct', d.minNetMarginPct),
    minNetProfitEur: num('min_net_profit_eur', d.minNetProfitEur),
  };
}
