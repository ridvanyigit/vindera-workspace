'use client';

/**
 * "Mark as Bought": records what was really paid and when. The live net-profit
 * preview uses lib/profit.ts; the backend recomputes and stores the real estimate.
 */

import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { apiFetch, errorMessage } from '@/lib/apiFetch';
import { calculateProfit } from '@/lib/profit';
import { returnByDate, todayIso } from '@/lib/lifecycle';
import type { BusinessConfig } from '@/lib/useBusinessConfig';
import ModalShell, { ErrorBanner, MODAL_INPUT_CLASS } from './ModalShell';

export interface BoughtDeal {
  id: string;
  title: string;
  buy_price: number;
  target_sell_price: number;
}

export default function BoughtModal({
  deal,
  config,
  onClose,
  onDone,
}: {
  deal: BoughtDeal;
  config: BusinessConfig;
  onClose: () => void;
  /** Called after the backend accepted the purchase. */
  onDone: () => void;
}) {
  const [price, setPrice] = useState(String(deal.buy_price));
  const [date, setDate] = useState(todayIso());
  const [orderRef, setOrderRef] = useState('');
  // Prefilled with the owner's defaults so what is shown is exactly what gets recorded.
  const [inbound, setInbound] = useState(String(config.profit.inboundShippingEur));
  const [packaging, setPackaging] = useState(String(config.profit.packagingEur));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceNum = Number(price);
  const valid = priceNum > 0 && date !== '' && inbound !== '' && packaging !== '';
  const preview = valid
    ? calculateProfit(
        { sellPrice: deal.target_sell_price, purchasePrice: priceNum, inboundShipping: Number(inbound), packaging: Number(packaging) },
        config.profit,
      )
    : null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/deals/${deal.id}/status`, {
        method: 'PATCH',
        json: {
          status: 'bought',
          purchase_price_actual: priceNum,
          // Noon local time keeps the calendar day stable across time zones.
          purchased_at: new Date(`${date}T12:00:00`).toISOString(),
          order_ref: orderRef.trim() || null,
          inbound_shipping_cost: Number(inbound),
          packaging_cost: Number(packaging),
        },
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e, 'Could not record the purchase.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Mark as Bought" icon={<ShoppingCart className="h-5 w-5 text-indigo-600" />} onClose={onClose} busy={saving}>
      <p className="type-body text-gray-600">
        Record what you really paid for <strong>{deal.title}</strong>. Reports and profit use these numbers, not the scan price.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-gray-500">Price paid (€) <span className="text-red-500">*</span></span>
          <input type="number" step="0.01" min="0" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} className={MODAL_INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-gray-500">Purchase date</span>
          <input type="date" value={date} max={todayIso()} onChange={e => setDate(e.target.value)} className={MODAL_INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-gray-500">Inbound shipping (€)</span>
          <input type="number" step="0.01" min="0" inputMode="decimal" value={inbound} onChange={e => setInbound(e.target.value)} className={MODAL_INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-gray-500">Packaging (€)</span>
          <input type="number" step="0.01" min="0" inputMode="decimal" value={packaging} onChange={e => setPackaging(e.target.value)} className={MODAL_INPUT_CLASS} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="type-label text-gray-500">Order reference (optional)</span>
        <input value={orderRef} maxLength={100} onChange={e => setOrderRef(e.target.value)} placeholder="Amazon order number" className={MODAL_INPUT_CLASS} />
      </label>

      {preview && (
        <div className="flex flex-col gap-1 rounded-lg border border-gray-100 bg-gray-50 p-3 text-[13px]">
          <div className="flex justify-between"><span className="text-gray-500">Total cost</span><span className="font-semibold tabular-nums text-gray-800">€{preview.totalCost.toFixed(2)}</span></div>
          <div className="flex justify-between">
            <span className="text-gray-500">Net profit at €{deal.target_sell_price.toFixed(2)}</span>
            <span className={`font-semibold tabular-nums ${preview.netProfit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>€{preview.netProfit.toFixed(2)} ({preview.netMarginPct.toFixed(1)}%)</span>
          </div>
          {!preview.passesGuardrails && <p className="text-[12px] text-amber-700">Below your No-Buy minimum (margin {config.profit.minNetMarginPct}% / profit €{config.profit.minNetProfitEur}).</p>}
          <div className="flex justify-between border-t border-gray-200 pt-1 mt-1"><span className="text-gray-500">Amazon return-by</span><span className="font-semibold tabular-nums text-gray-800">{returnByDate(date, config.returnWindowDays)}</span></div>
        </div>
      )}

      <ErrorBanner message={error} />

      <div className="flex gap-3">
        <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">Cancel</button>
        <button onClick={submit} disabled={!valid || saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:bg-indigo-300 transition">{saving ? 'Saving...' : 'Confirm purchase'}</button>
      </div>
    </ModalShell>
  );
}
