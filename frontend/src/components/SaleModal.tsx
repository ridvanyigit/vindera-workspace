'use client';

/**
 * "Item Sold!": posts the sale to POST /deals/{id}/sale. The profit shown while
 * typing is a preview (lib/profit.ts); the success state shows the figure the
 * backend computed and stored.
 */

import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { apiFetch, errorMessage } from '@/lib/apiFetch';
import { actualProfit } from '@/lib/profit';
import type { BusinessConfig } from '@/lib/useBusinessConfig';
import ModalShell, { ErrorBanner, MODAL_INPUT_CLASS } from './ModalShell';

/** Predefined options for the "Sold during event?" dropdown, mirrors events_calendar seed data. */
const SALE_EVENT_OPTIONS = ['Black Friday', 'Christmas', 'Halloween', 'Winter Sales (WSV)', "Valentine's Day", 'Easter', 'Cyber Monday', 'Other'];

export interface SaleDeal {
  id: string;
  title: string;
  buy_price: number;
  target_sell_price: number;
  purchase_price_actual?: number | null;
  inbound_shipping_cost?: number | null;
  packaging_cost?: number | null;
}

interface SaleResult {
  actual_profit: number;
  net_margin_pct: number | null;
  total_cost: number;
}

export default function SaleModal({
  deal,
  config,
  onClose,
  onDone,
}: {
  deal: SaleDeal;
  config: BusinessConfig;
  onClose: () => void;
  /** Called when the owner closes the success state (the list should refresh). */
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(String(deal.target_sell_price));
  const [shipping, setShipping] = useState(String(config.profit.outboundShippingEur));
  const [fees, setFees] = useState('');
  const [inquiries, setInquiries] = useState('');
  const [event, setEvent] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaleResult | null>(null);

  const amountNum = Number(amount);
  const preview =
    amountNum > 0
      ? actualProfit({
          saleAmount: amountNum,
          purchasePrice: deal.purchase_price_actual ?? deal.buy_price,
          inboundShipping: deal.inbound_shipping_cost,
          packaging: deal.packaging_cost,
          shippingCost: Number(shipping) || 0,
          platformFees: Number(fees) || 0,
        })
      : null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<SaleResult>(`/deals/${deal.id}/sale`, {
        method: 'POST',
        json: {
          amount: amountNum,
          shipping_cost: Number(shipping) || 0,
          platform_fees: Number(fees) || 0,
          customer_inquiries_count: Number(inquiries) || 0,
          customer_messages_summary: notes.trim() || undefined,
          sold_during_event: event || undefined,
        },
      });
      setResult(data);
    } catch (e) {
      setError(errorMessage(e, 'Could not record the sale.'));
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <ModalShell title="Sale recorded" icon={<CheckCircle className="h-5 w-5 text-green-600" />} onClose={onDone}>
        <p className="type-body text-gray-600"><strong>{deal.title}</strong> is sold and booked in the ledger.</p>
        <div className="flex flex-col gap-1 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-[13px]">
          <div className="flex justify-between"><span className="text-emerald-800">Total cost</span><span className="font-semibold tabular-nums text-emerald-800">€{result.total_cost.toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="font-semibold text-emerald-800">Net profit</span><span className="text-[15px] font-bold tabular-nums text-emerald-700">€{result.actual_profit.toFixed(2)}{result.net_margin_pct !== null && ` (${result.net_margin_pct.toFixed(1)}%)`}</span></div>
        </div>
        <button onClick={onDone} className="py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 transition">Done</button>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Confirm Sale" icon={<CheckCircle className="h-5 w-5 text-green-600" />} onClose={onClose} busy={saving}>
      <p className="type-body text-gray-600">Record what actually happened selling <strong>{deal.title}</strong>. This becomes training data for the future pricing model.</p>

      <label className="flex flex-col gap-1.5">
        <span className="type-label text-gray-500">Actual Sell Price (€) <span className="text-red-500">*</span></span>
        <input type="number" step="0.01" min="0" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(deal.target_sell_price)} className={MODAL_INPUT_CLASS} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-gray-500">Shipping to buyer (€)</span>
          <input type="number" step="0.01" min="0" inputMode="decimal" value={shipping} onChange={e => setShipping(e.target.value)} placeholder="0.00" className={MODAL_INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-gray-500">Platform / payment fees (€)</span>
          <input type="number" step="0.01" min="0" inputMode="decimal" value={fees} onChange={e => setFees(e.target.value)} placeholder="0.00" className={MODAL_INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-gray-500">Customer Inquiries</span>
          <input type="number" step="1" min="0" inputMode="numeric" value={inquiries} onChange={e => setInquiries(e.target.value)} placeholder="0" className={MODAL_INPUT_CLASS} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-gray-500">Sold during event?</span>
          <select value={event} onChange={e => setEvent(e.target.value)} className={`${MODAL_INPUT_CLASS} cursor-pointer`}>
            <option value="">None</option>
            {SALE_EVENT_OPTIONS.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="type-label text-gray-500">Notes / Messages Summary</span>
        <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What buyers asked about or objected to..." className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50" />
      </label>

      {preview && (
        <div className="flex justify-between items-center bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
          <span className="text-[13px] font-semibold text-emerald-800">Net Profit (preview)</span>
          <span className={`text-[15px] font-bold tabular-nums ${preview.netProfit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>€{preview.netProfit.toFixed(2)}</span>
        </div>
      )}

      <ErrorBanner message={error} />

      <div className="flex gap-3">
        <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">Cancel</button>
        <button onClick={submit} disabled={!(amountNum > 0) || saving} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:bg-green-300 transition">{saving ? 'Saving...' : 'Confirm Sale'}</button>
      </div>
    </ModalShell>
  );
}
