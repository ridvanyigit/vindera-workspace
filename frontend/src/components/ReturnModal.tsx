'use client';

/** "Returned": a customer sent the item back. Books the refund and puts the unit back into quarantine. */

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { apiFetch, errorMessage } from '@/lib/apiFetch';
import ModalShell, { ErrorBanner, MODAL_INPUT_CLASS } from './ModalShell';

export default function ReturnModal({
  deal,
  onClose,
  onDone,
}: {
  deal: { id: string; title: string };
  onClose: () => void;
  /** Called after the backend accepted the return. */
  onDone: () => void;
}) {
  const [shipping, setShipping] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/deals/${deal.id}/return`, {
        method: 'POST',
        json: { return_shipping_cost: Number(shipping) || 0, note: note.trim() || undefined },
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e, 'Could not record the return.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Customer return" icon={<RotateCcw className="h-5 w-5 text-amber-600" />} onClose={onClose} busy={saving}>
      <p className="type-body text-gray-600">
        Confirm that the customer sent back <strong>{deal.title}</strong>. The full price is refunded in the ledger (the sale stays on record),
        and the unit goes back into inventory in quarantine. Its target price is not changed: re-price it deliberately once you have checked it.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="type-label text-gray-500">Return shipping you paid (€, optional)</span>
        <input type="number" step="0.01" min="0" inputMode="decimal" value={shipping} onChange={e => setShipping(e.target.value)} placeholder="0.00" className={MODAL_INPUT_CLASS} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="type-label text-gray-500">Note (optional)</span>
        <input value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Reason for the return" className={MODAL_INPUT_CLASS} />
      </label>

      <ErrorBanner message={error} />

      <div className="flex gap-3">
        <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50">Cancel</button>
        <button onClick={submit} disabled={saving} className="flex-1 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:bg-amber-300 transition">{saving ? 'Saving...' : 'Confirm return'}</button>
      </div>
    </ModalShell>
  );
}
