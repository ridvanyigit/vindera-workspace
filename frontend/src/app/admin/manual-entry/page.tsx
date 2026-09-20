'use client';

/**
 * Manual Entry — create or edit a complete opportunity by hand, without Keepa
 * or OpenAI.
 *
 * Visiting /manual-entry opens a blank form. Visiting /manual-entry?id=<uuid>
 * loads that opportunity and switches the page into edit mode.
 *
 * Every field the workspace, product master and reports read is available here,
 * so a manually entered deal renders exactly like a scanned one.
 *
 * Writes go through the backend (service role) because RLS only grants the
 * browser SELECT on these tables — see
 * supabase/migrations/20260916140000_enable_rls_policies.sql
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { apiUrl } from '@/lib/api';
import { checkIsAdmin } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import {
  Package, LogOut, HelpCircle, Save, RefreshCw, RotateCcw, CheckCircle, XCircle,
  Barcode, Euro, Activity, MapPin, FileText, ShoppingCart, Trash2, Sun, Moon,
} from 'lucide-react';
import { useDarkMode } from '@/lib/useDarkMode';
import { PRODUCT_CATEGORIES, STATUS_OPTIONS, CONDITION_OPTIONS, SCORE_CRITERIA } from '@/lib/constants';

interface ScoreBreakdown {
  discount: number; demand: number; competition: number; capital_efficiency: number;
  storage_size: number; risk_level: number; seasonality: number;
}

interface FormState {
  asin: string;
  title: string;
  category: string;
  image_url: string;
  gallery_image_urls: string;
  buy_price: string;
  target_sell_price: string;
  emergency_sell_price: string;
  willhaben_realistic_price: string;
  willhaben_url: string;
  amazon_price_today: string;
  amazon_price_90d_avg: string;
  status: string;
  product_condition: string;
  warehouse_location: string;
  is_quarantine: boolean;
  sku: string;
  buybox_seller: string;
  buybox_is_fba: boolean;
  deal_score: string;
  holding_period_months: string;
  ai_decision: string;
  purchase_thesis: string;
  seasonality_analysis: string;
  listing_title: string;
  listing_description: string;
  // Sale outcome — only sent when status is 'sold'. Feeds the future ML model.
  actual_sell_price: string;
  shipping_and_prep_cost: string;
  platform_fees: string;
  customer_inquiries_count: string;
  customer_messages_summary: string;
  sold_during_event: string;
}

/** Mirrors the events_calendar seed data — see supabase/seed.sql. */
const SALE_EVENT_OPTIONS = ['Black Friday', 'Christmas', 'Halloween', 'Winter Sales (WSV)', "Valentine's Day", 'Easter', 'Cyber Monday', 'Other'];

const EMPTY_SCORES: ScoreBreakdown = {
  discount: 5, demand: 5, competition: 5, capital_efficiency: 5,
  storage_size: 5, risk_level: 5, seasonality: 5,
};

const EMPTY_FORM: FormState = {
  asin: '',
  title: '',
  category: PRODUCT_CATEGORIES[0].value,
  image_url: '',
  gallery_image_urls: '',
  buy_price: '',
  target_sell_price: '',
  emergency_sell_price: '',
  willhaben_realistic_price: '',
  willhaben_url: '',
  amazon_price_today: '',
  amazon_price_90d_avg: '',
  status: 'pending',
  product_condition: 'NEW',
  warehouse_location: 'A01',
  is_quarantine: false,
  sku: '',
  buybox_seller: 'Manual',
  buybox_is_fba: false,
  deal_score: '85',
  holding_period_months: '2',
  ai_decision: '',
  purchase_thesis: '',
  seasonality_analysis: '',
  listing_title: '',
  listing_description: '',
  actual_sell_price: '',
  shipping_and_prep_cost: '',
  platform_fees: '',
  customer_inquiries_count: '',
  customer_messages_summary: '',
  sold_during_event: '',
};

const generateSku = () => `GEN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/** Written by the backend when no analysis notes were supplied. */
const DEFAULT_AI_DECISION = 'Manually entered deal. No automated analysis was performed.';

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-[14px] text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50';
const SELECT_CLASS = `${INPUT_CLASS} cursor-pointer`;
const TEXTAREA_CLASS =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50';

// These live at module scope on purpose: declaring them inside the page
// component would remount every input on each keystroke and steal focus.

/** Hover target carrying a short "where do I find this?" explanation. */
const Hint = ({ text }: { text: string }) => (
  <span title={text} className="cursor-help text-gray-300 transition hover:text-indigo-500">
    <HelpCircle className="h-3.5 w-3.5" />
  </span>
);

const Field = ({ label, hint, required, children }: {
  label: string; hint: string; required?: boolean; children: React.ReactNode;
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="flex items-center gap-1.5 type-label text-gray-500">
      {label}
      {required && <span className="text-red-500">*</span>}
      <Hint text={hint} />
    </span>
    {children}
  </label>
);

const Section = ({ icon, title, description, children }: {
  icon: React.ReactNode; title: string; description: string; children: React.ReactNode;
}) => (
  <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
    <div className="mb-5 flex items-start gap-3">
      <div className="mt-0.5 text-indigo-600">{icon}</div>
      <div>
        <h2 className="type-section-title text-gray-800">{title}</h2>
        <p className="mt-0.5 text-[13px] text-gray-500">{description}</p>
      </div>
    </div>
    {children}
  </section>
);

export default function ManualEntry() {
  const router = useRouter();
  const { dark, toggle: toggleDark } = useDarkMode();
  const [ready, setReady] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [scores, setScores] = useState<ScoreBreakdown>(EMPTY_SCORES);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Read from location rather than useSearchParams: no Suspense boundary needed.
    const id = new URLSearchParams(window.location.search).get('id');

    // Protected route, same guard as every other admin page.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push('/admin/login');
        return;
      }
      if (!(await checkIsAdmin())) {
        router.push('/');
        return;
      }

      if (!id) {
        // Generated after mount to avoid a server/client hydration mismatch.
        setForm(current => ({ ...current, sku: generateSku() }));
        setReady(true);
        return;
      }

      const { data, error: loadError } = await supabase
        .from('opportunities')
        .select(`
          id, buy_price, target_sell_price, emergency_sell_price, willhaben_realistic_price, willhaben_url,
          deal_score, holding_period_months, seasonality_analysis, sku, warehouse_location,
          product_condition, is_quarantine, score_breakdown, purchase_thesis, ai_decision,
          status, buybox_seller, buybox_is_fba,
          actual_sell_price, shipping_and_prep_cost, platform_fees, customer_inquiries_count,
          customer_messages_summary, sold_during_event,
          products ( asin, title, category, image_url, gallery_image_urls ),
          generated_listings ( generated_title, generated_description )
        `)
        .eq('id', id)
        .single();

      if (loadError || !data) {
        setError('Could not load that deal. It may have been deleted.');
        setForm(current => ({ ...current, sku: generateSku() }));
        setReady(true);
        return;
      }

      const deal = data as any;
      const product = deal.products || {};
      const listing = deal.generated_listings?.[0] || {};

      setEditingId(id);
      setForm({
        asin: product.asin || '',
        title: product.title || '',
        category: product.category || PRODUCT_CATEGORIES[0].value,
        image_url: product.image_url || '',
        gallery_image_urls: Array.isArray(product.gallery_image_urls) ? product.gallery_image_urls.join('\n') : '',
        buy_price: String(deal.buy_price ?? ''),
        target_sell_price: String(deal.target_sell_price ?? ''),
        emergency_sell_price: String(deal.emergency_sell_price ?? ''),
        willhaben_realistic_price: String(deal.willhaben_realistic_price ?? ''),
        willhaben_url: deal.willhaben_url || '',
        // Not stored on the opportunity; left blank so existing price history is kept.
        amazon_price_today: '',
        amazon_price_90d_avg: '',
        status: deal.status || 'pending',
        product_condition: deal.product_condition || 'NEW',
        warehouse_location: deal.warehouse_location || 'A01',
        is_quarantine: Boolean(deal.is_quarantine),
        sku: deal.sku || generateSku(),
        buybox_seller: deal.buybox_seller || 'Manual',
        buybox_is_fba: Boolean(deal.buybox_is_fba),
        deal_score: String(deal.deal_score ?? 85),
        holding_period_months: String(deal.holding_period_months ?? 2),
        ai_decision: deal.ai_decision === DEFAULT_AI_DECISION ? '' : (deal.ai_decision || ''),
        purchase_thesis: deal.purchase_thesis || '',
        seasonality_analysis: deal.seasonality_analysis || '',
        listing_title: listing.generated_title || '',
        listing_description: listing.generated_description || '',
        actual_sell_price: deal.actual_sell_price != null ? String(deal.actual_sell_price) : '',
        shipping_and_prep_cost: deal.shipping_and_prep_cost != null ? String(deal.shipping_and_prep_cost) : '',
        platform_fees: deal.platform_fees != null ? String(deal.platform_fees) : '',
        customer_inquiries_count: deal.customer_inquiries_count != null ? String(deal.customer_inquiries_count) : '',
        customer_messages_summary: deal.customer_messages_summary || '',
        sold_during_event: deal.sold_during_event || '',
      });
      if (deal.score_breakdown) setScores({ ...EMPTY_SCORES, ...deal.score_breakdown });
      setReady(true);
    });
  }, [router]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  // --- Live preview -------------------------------------------------------
  const buyPrice = Number(form.buy_price) || 0;
  const targetPrice = Number(form.target_sell_price) || 0;
  const grossProfit = targetPrice - buyPrice;
  const profitMargin = buyPrice > 0 ? (grossProfit / buyPrice) * 100 : 0;
  const autoEmergencyPrice = targetPrice > 0 ? targetPrice * 0.85 : 0;

  const amazonToday = Number(form.amazon_price_today) || 0;
  const amazon90Avg = Number(form.amazon_price_90d_avg) || 0;
  const discountPct = amazon90Avg > 0 && amazonToday > 0
    ? ((amazon90Avg - amazonToday) / amazon90Avg) * 100
    : null;

  // Mirrors the backend No-Buy Guardrails so the verdict is visible before saving.
  const passesGuardrails = profitMargin >= 25 && grossProfit >= 15;

  const resetForm = () => {
    setForm({ ...EMPTY_FORM, sku: generateSku() });
    setScores(EMPTY_SCORES);
    setError(null);
  };

  const validate = (): string | null => {
    if (!form.asin.trim()) return 'ASIN is required.';
    if (form.asin.trim().length !== 10) return 'An Amazon ASIN is exactly 10 characters long.';
    if (!form.title.trim()) return 'Product title is required.';
    if (buyPrice <= 0) return 'Buy price must be greater than zero.';
    if (targetPrice <= 0) return 'Target sell price must be greater than zero.';
    if (!form.listing_title.trim()) return 'The Willhaben listing title is required.';
    if (!form.listing_description.trim()) return 'The Willhaben listing description is required.';
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaving(true);

    const body = {
      asin: form.asin.trim().toUpperCase(),
      title: form.title.trim(),
      category: form.category,
      image_url: form.image_url.trim() || null,
      gallery_image_urls: form.gallery_image_urls.split('\n').map(u => u.trim()).filter(Boolean),
      buy_price: buyPrice,
      target_sell_price: targetPrice,
      emergency_sell_price: form.emergency_sell_price ? Number(form.emergency_sell_price) : null,
      willhaben_realistic_price: form.willhaben_realistic_price ? Number(form.willhaben_realistic_price) : null,
      willhaben_url: form.willhaben_url.trim() || null,
      amazon_price_today: amazonToday || null,
      amazon_price_90d_avg: amazon90Avg || null,
      status: form.status,
      product_condition: form.product_condition,
      warehouse_location: form.warehouse_location.trim() || 'A01',
      is_quarantine: form.is_quarantine,
      sku: form.sku.trim() || null,
      buybox_seller: form.buybox_seller.trim() || 'Manual',
      buybox_is_fba: form.buybox_is_fba,
      deal_score: Number(form.deal_score) || 0,
      holding_period_months: Number(form.holding_period_months) || 0,
      ai_decision: form.ai_decision.trim() || null,
      purchase_thesis: form.purchase_thesis.trim() || null,
      seasonality_analysis: form.seasonality_analysis.trim() || null,
      score_breakdown: scores,
      listing_title: form.listing_title.trim(),
      listing_description: form.listing_description.trim(),
      ...(form.status === 'sold' ? {
        actual_sell_price: form.actual_sell_price ? Number(form.actual_sell_price) : null,
        actual_profit: form.actual_sell_price
          ? Number((Number(form.actual_sell_price) - buyPrice - (Number(form.shipping_and_prep_cost) || 0) - (Number(form.platform_fees) || 0)).toFixed(2))
          : null,
        shipping_and_prep_cost: form.shipping_and_prep_cost ? Number(form.shipping_and_prep_cost) : null,
        platform_fees: form.platform_fees ? Number(form.platform_fees) : null,
        customer_inquiries_count: form.customer_inquiries_count ? Number(form.customer_inquiries_count) : null,
        customer_messages_summary: form.customer_messages_summary.trim() || null,
        sold_during_event: form.sold_during_event || null,
      } : {}),
    };

    try {
      const res = await fetch(
        editingId ? apiUrl(`/deals/${editingId}/manual`) : apiUrl('/deals/manual'),
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload?.detail || `Request failed with status ${res.status}.`);
      }

      if (editingId) {
        setSuccess(`Deal updated! SKU ${payload.sku} — margin recalculated to ${payload.profit_margin}%.`);
      } else {
        setSuccess(`Deal successfully saved! SKU ${payload.sku} — check your Workspace.`);
        resetForm();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setError(err?.message || 'Could not reach the backend. Is it running on port 8000?');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;

    // Vindera has no Willhaben API access, so this can only ever be a manual
    // nudge — not an automatic cross-delete. Willhaben->Vindera deletion sync
    // isn't offered at all: there is no reliable way to detect a listing was
    // removed there short of scraping, which is fragile and not something
    // this app does.
    const confirmMessage = form.willhaben_url
      ? `Delete "${form.title}" permanently? The product's price history is kept, everything else about this deal is removed.\n\nThis item is still live on Willhaben — after you confirm, its listing page will open in a new tab so you can remove it there too.`
      : `Delete "${form.title}" permanently? The product's price history is kept, everything else about this deal is removed.`;
    if (!window.confirm(confirmMessage)) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(apiUrl(`/deals/${editingId}`), { method: 'DELETE' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || `Request failed with status ${res.status}.`);
      if (form.willhaben_url) window.open(form.willhaben_url, '_blank', 'noopener,noreferrer');
      router.push('/admin');
    } catch (err: any) {
      setError(err?.message || 'Could not delete the deal.');
      setDeleting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!ready) {
    return (
      <div className="vindera-admin flex min-h-screen items-center justify-center bg-gray-50">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="vindera-admin flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">

      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 h-14 shrink-0 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-sm">
                <Package className="h-5 w-5 text-white" />
              </div>
              <div className="leading-tight">
                <div className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">VINDERA</div>
                <div className="text-[9px] font-medium tracking-[0.18em] text-gray-400">WORKSPACE</div>
              </div>
            </div>
            <div className="hidden items-center gap-1 md:flex">
              <button onClick={() => router.push('/admin')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Workspace</button>
              <button onClick={() => router.push('/admin/products')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Product Master</button>
              <button onClick={() => router.push('/admin/manual-entry')} className="rounded-lg bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">{editingId ? 'Edit Deal' : 'Manual Entry'}</button>
              <button onClick={() => router.push('/admin/reports')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Tax & Reports</button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="mx-1 h-4 w-px bg-gray-200" />
            <button
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleDark}
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              title="Sign out"
              onClick={async () => { await supabase.auth.signOut(); router.push('/admin/login'); }}
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* CONTENT */}
      <main className="mx-auto w-full max-w-4xl flex-1 p-8">

        <div className="mb-6">
          <h1 className="type-page-title text-gray-900">{editingId ? 'Edit Deal' : 'Manual Entry'}</h1>
          <p className="mt-1 text-[13px] text-gray-500">
            {editingId ? (
              <>
                Correcting an existing deal. Leave the two Amazon reference prices empty to keep the stored price history{' '}
                untouched — filling them in replaces it.
              </>
            ) : (
              <>
                Add an arbitrage opportunity by hand — no Keepa credits, no OpenAI calls. Hover any{' '}
                <HelpCircle className="inline h-3.5 w-3.5 -translate-y-px text-gray-400" /> for guidance on where to find the value.
              </>
            )}
          </p>
        </div>

        {success && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="flex-1">
              <p className="type-section-title text-emerald-800">Saved</p>
              <p className="type-body text-emerald-700">{success}</p>
            </div>
            <button
              onClick={() => router.push('/admin')}
              className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
            >
              Open Workspace
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            <div>
              <p className="type-section-title text-red-800">Could not save</p>
              <p className="type-body text-red-700">{error}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">

          {/* Product identity */}
          <Section
            icon={<ShoppingCart className="h-5 w-5" />}
            title="Product Identity"
            description="Who the product is. The ASIN plus the German marketplace uniquely identifies it."
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label="ASIN"
                required
                hint="The 10-character Amazon ID. Find it in the product URL after /dp/ (e.g. amazon.de/dp/B09Y2MYL5C) or in the 'Product information' table further down the page."
              >
                <input
                  value={form.asin}
                  onChange={e => set('asin', e.target.value.toUpperCase().replace(/\s/g, ''))}
                  maxLength={10}
                  placeholder="B09Y2MYL5C"
                  className={`${INPUT_CLASS} font-mono`}
                />
              </Field>

              <Field
                label="Category"
                required
                hint="Pick the closest match. This drives the workspace filter and the Quarterly Category Audit, so stay consistent — the scan pipeline uses this exact same list."
              >
                <select value={form.category} onChange={e => set('category', e.target.value)} className={SELECT_CLASS}>
                  {PRODUCT_CATEGORIES.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>

              <div className="md:col-span-2">
                <Field
                  label="Product Title"
                  required
                  hint="Copy the title straight from the Amazon listing. This is what you see in the deal explorer, so shorten it if it is a 200-character keyword dump."
                >
                  <input
                    value={form.title}
                    onChange={e => set('title', e.target.value)}
                    placeholder="Anker Soundcore Q30 Wireless Headphones, Black"
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>

              <div className="md:col-span-2">
                <Field
                  label="Image URL"
                  hint="Optional. Right-click the main product photo on Amazon and copy the image address. Leave empty if you do not need a thumbnail."
                >
                  <input
                    value={form.image_url}
                    onChange={e => set('image_url', e.target.value)}
                    placeholder="https://m.media-amazon.com/images/I/..."
                    className={INPUT_CLASS}
                  />
                </Field>
              </div>

              <div className="md:col-span-2">
                <Field
                  label="Gallery Image URLs"
                  hint="Optional. One URL per line — extra photos for the storefront's product page thumbnail strip, in addition to the cover image above."
                >
                  <textarea
                    rows={3}
                    value={form.gallery_image_urls}
                    onChange={e => set('gallery_image_urls', e.target.value)}
                    placeholder={'https://m.media-amazon.com/images/I/angle2.jpg\nhttps://m.media-amazon.com/images/I/angle3.jpg'}
                    className={`${TEXTAREA_CLASS} font-mono text-[13px]`}
                  />
                </Field>
              </div>
            </div>
          </Section>

          {/* Pricing */}
          <Section
            icon={<Euro className="h-5 w-5" />}
            title="Pricing Strategy"
            description="The three-tier strategy the workspace shows: what you pay, what you ask, and your liquidation floor."
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label="Buy Price (€)"
                required
                hint="What you actually pay on Amazon today, including shipping. Every ROI calculation is based on this number."
              >
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={form.buy_price}
                  onChange={e => set('buy_price', e.target.value)}
                  placeholder="45.00"
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </Field>

              <Field
                label="Target Sell Price (€)"
                required
                hint="Your asking price on Willhaben. A good starting point is halfway between your buy price and the product's normal Amazon price."
              >
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={form.target_sell_price}
                  onChange={e => set('target_sell_price', e.target.value)}
                  placeholder="72.00"
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </Field>

              <Field
                label="Emergency Sell Price (€)"
                hint="Your liquidation floor for dead stock. Leave empty and it defaults to 85% of the target price, exactly like the scan pipeline does."
              >
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={form.emergency_sell_price}
                  onChange={e => set('emergency_sell_price', e.target.value)}
                  placeholder={autoEmergencyPrice ? `Auto: ${autoEmergencyPrice.toFixed(2)}` : 'Auto: 85% of target'}
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </Field>

              <Field
                label="Willhaben Realistic Price (€)"
                hint="What comparable items actually change hands for on Willhaben — not what sellers are asking. Search the product name and look at older listings. Defaults to your target price."
              >
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={form.willhaben_realistic_price}
                  onChange={e => set('willhaben_realistic_price', e.target.value)}
                  placeholder="Defaults to target price"
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </Field>

              <Field
                label="Amazon Price Today (€)"
                hint="The price Amazon shows right now on the product page. Together with the 90-day average this becomes the real price history chart in the workspace."
              >
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={form.amazon_price_today}
                  onChange={e => set('amazon_price_today', e.target.value)}
                  placeholder="Usually the same as your buy price"
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </Field>

              <Field
                label="Amazon 90-Day Average (€)"
                hint="What this normally costs on Amazon. Without Keepa, use the crossed-out list price, or check camelcamelcamel.com / the price history shown by the Keepa browser extension (free for viewing)."
              >
                <input
                  type="number" step="0.01" min="0" inputMode="decimal"
                  value={form.amazon_price_90d_avg}
                  onChange={e => set('amazon_price_90d_avg', e.target.value)}
                  placeholder="Its normal, non-discounted price"
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </Field>
            </div>

            {buyPrice > 0 && targetPrice > 0 && (
              <div className={`mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border p-4 ${
                passesGuardrails ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="type-label text-gray-500">Gross Profit</span>
                  <span className={`text-[15px] font-semibold tabular-nums ${grossProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {grossProfit >= 0 ? '+' : '−'}€{Math.abs(grossProfit).toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="type-label text-gray-500">Margin</span>
                  <span className="text-[15px] font-semibold tabular-nums text-gray-900">{profitMargin.toFixed(1)}%</span>
                </div>
                {discountPct !== null && (
                  <div className="flex items-center gap-2">
                    <span className="type-label text-gray-500">Amazon Discount</span>
                    <span className={`text-[15px] font-semibold tabular-nums ${discountPct >= 25 ? 'text-emerald-700' : 'text-gray-900'}`}>
                      {discountPct.toFixed(1)}%
                    </span>
                  </div>
                )}
                <div className="flex-1" />
                <span
                  title="The scan pipeline rejects deals below 25% margin or under €15 raw profit. This preview applies the same rule — nothing is blocked, you can still save it."
                  className={`cursor-help rounded-md border bg-white px-2.5 py-1 type-label ${
                    passesGuardrails ? 'border-emerald-300 text-emerald-700' : 'border-amber-300 text-amber-700'
                  }`}
                >
                  {passesGuardrails ? 'Passes No-Buy Guardrails' : 'Below No-Buy Thresholds'}
                </span>
              </div>
            )}
          </Section>

          {/* Scorecard */}
          <Section
            icon={<Activity className="h-5 w-5" />}
            title="Acquisition Scorecard"
            description="Your own judgement, scored the way the AI would. Drives the scorecard panel and the Smart Radar ranking."
          >
            <div className="mb-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label="Overall Deal Score (0-100)"
                hint="Your confidence in this deal. 80 and above marks it as a hot deal and pushes it to the top of the AI Smart Radar."
              >
                <input
                  type="number" min="0" max="100"
                  value={form.deal_score}
                  onChange={e => set('deal_score', e.target.value)}
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </Field>

              <Field
                label="Holding Period (months)"
                hint="How long you expect to sit on this before it sells. Seasonal goods bought off-season often need 3-6 months."
              >
                <input
                  type="number" min="0" max="36"
                  value={form.holding_period_months}
                  onChange={e => set('holding_period_months', e.target.value)}
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SCORE_CRITERIA.map(criterion => {
                const value = scores[criterion.key as keyof ScoreBreakdown];
                return (
                  <div key={criterion.key} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span className="flex items-center gap-1 type-label text-gray-500">
                        {criterion.label}
                        <Hint text={criterion.hint} />
                      </span>
                      <span className={`text-[13px] font-semibold tabular-nums ${
                        value >= 8 ? 'text-emerald-600' : value >= 5 ? 'text-amber-600' : 'text-red-500'
                      }`}>{value}/10</span>
                    </div>
                    <input
                      type="range" min="0" max="10" step="1"
                      value={value}
                      onChange={e => setScores(current => ({ ...current, [criterion.key]: Number(e.target.value) }))}
                      className="w-full cursor-pointer accent-indigo-600"
                    />
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Lifecycle & logistics */}
          <Section
            icon={<MapPin className="h-5 w-5" />}
            title="Lifecycle & Logistics"
            description="Where the deal sits in your pipeline and where the item physically lives."
          >
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label="Status"
                required
                hint="Where the deal starts. Use 'Pending' for something you have not bought yet, or jump straight to 'In Inventory' when back-filling an item already sitting in your storage room."
              >
                <select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT_CLASS}>
                  {STATUS_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>

              <Field
                label="Product Condition"
                hint="Recorded during the receiving check. 'Open Box' lowers what buyers will pay, so reflect it in your target price."
              >
                <select value={form.product_condition} onChange={e => set('product_condition', e.target.value)} className={SELECT_CLASS}>
                  {CONDITION_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>

              <Field
                label="SKU"
                hint="Auto-generated internal code. Write it on the box so you can find the item later. Overwrite it if you use your own numbering."
              >
                <div className="flex gap-2">
                  <input
                    value={form.sku}
                    onChange={e => set('sku', e.target.value.toUpperCase())}
                    className={`${INPUT_CLASS} font-mono`}
                  />
                  <button
                    type="button"
                    title="Generate a new SKU"
                    onClick={() => set('sku', generateSku())}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:border-gray-300 hover:text-indigo-600"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </Field>

              <Field
                label="Warehouse Location"
                hint="Your own shelf code for the storage room, e.g. A01 or B03. Keeps picking fast once you have dozens of items."
              >
                <input
                  value={form.warehouse_location}
                  onChange={e => set('warehouse_location', e.target.value.toUpperCase())}
                  placeholder="A01"
                  className={`${INPUT_CLASS} font-mono`}
                />
              </Field>

              <Field
                label="BuyBox Seller"
                hint="Who currently owns the Amazon BuyBox: 'Amazon', a known retailer, or an unfamiliar third-party name. Leave as 'Manual' if you did not check."
              >
                <input
                  value={form.buybox_seller}
                  onChange={e => set('buybox_seller', e.target.value)}
                  placeholder="Amazon"
                  className={INPUT_CLASS}
                />
              </Field>

              <div className="flex flex-col justify-end gap-3 pb-1">
                <label
                  title="Shipped by Amazon (Prime). FBA sellers are far more likely to be genuine, which lowers your counterfeit and return risk."
                  className="flex cursor-help items-center gap-2.5"
                >
                  <input
                    type="checkbox"
                    checked={form.buybox_is_fba}
                    onChange={e => set('buybox_is_fba', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                  />
                  <span className="text-[14px] text-gray-700">Fulfilled by Amazon (Prime)</span>
                </label>

                <label
                  title="Flags the item for inspection before it can be listed. Use it when packaging is damaged or something looks off."
                  className="flex cursor-help items-center gap-2.5"
                >
                  <input
                    type="checkbox"
                    checked={form.is_quarantine}
                    onChange={e => set('is_quarantine', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                  />
                  <span className="text-[14px] text-gray-700">Put in quarantine (needs review)</span>
                </label>
              </div>
            </div>
          </Section>

          {/* Sale outcome — only relevant once the deal is actually sold */}
          {form.status === 'sold' && (
            <Section
              icon={<CheckCircle className="h-5 w-5" />}
              title="Sale Outcome"
              description="What actually happened. This is the ground-truth data the future ML model will train on."
            >
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field
                  label="Actual Sell Price (€)"
                  hint="The final, haggled price the buyer actually paid — not your target price."
                >
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={form.actual_sell_price}
                    onChange={e => set('actual_sell_price', e.target.value)}
                    placeholder={targetPrice ? targetPrice.toFixed(2) : '0.00'}
                    className={`${INPUT_CLASS} tabular-nums`}
                  />
                </Field>

                <Field
                  label="Number of Customer Inquiries"
                  hint="How many different buyers messaged you about this listing. A proxy for demand."
                >
                  <input
                    type="number" step="1" min="0" inputMode="numeric"
                    value={form.customer_inquiries_count}
                    onChange={e => set('customer_inquiries_count', e.target.value)}
                    placeholder="0"
                    className={`${INPUT_CLASS} tabular-nums`}
                  />
                </Field>

                <Field
                  label="Shipping & Prep Costs (€)"
                  hint="Packaging, tape, boxes and shipping paid out of pocket for this sale."
                >
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={form.shipping_and_prep_cost}
                    onChange={e => set('shipping_and_prep_cost', e.target.value)}
                    placeholder="0.00"
                    className={`${INPUT_CLASS} tabular-nums`}
                  />
                </Field>

                <Field
                  label="Platform Fees (€)"
                  hint="Commission or fees Willhaben (or whichever platform sold it) kept."
                >
                  <input
                    type="number" step="0.01" min="0" inputMode="decimal"
                    value={form.platform_fees}
                    onChange={e => set('platform_fees', e.target.value)}
                    placeholder="0.00"
                    className={`${INPUT_CLASS} tabular-nums`}
                  />
                </Field>

                <Field
                  label="Sold during event?"
                  hint="Optional. Was a seasonal event active when this sold? Leave as None if not."
                >
                  <select value={form.sold_during_event} onChange={e => set('sold_during_event', e.target.value)} className={SELECT_CLASS}>
                    <option value="">None</option>
                    {SALE_EVENT_OPTIONS.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </Field>

                <div className="md:col-span-2">
                  <Field
                    label="Notes / Messages Summary"
                    hint="Summarize what buyers asked about or objected to — useful signal for pricing and listing quality."
                  >
                    <textarea
                      rows={3}
                      value={form.customer_messages_summary}
                      onChange={e => set('customer_messages_summary', e.target.value)}
                      placeholder="Buyers mostly asked about the warranty and whether the box was still sealed."
                      className={TEXTAREA_CLASS}
                    />
                  </Field>
                </div>
              </div>

              {form.actual_sell_price && (
                <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <span className="type-label text-gray-500">Net Profit</span>
                  <span className="text-[15px] font-semibold tabular-nums text-emerald-700">
                    €{(Number(form.actual_sell_price) - buyPrice - (Number(form.shipping_and_prep_cost) || 0) - (Number(form.platform_fees) || 0)).toFixed(2)}
                  </span>
                </div>
              )}
            </Section>
          )}

          {/* Decision notes */}
          <Section
            icon={<FileText className="h-5 w-5" />}
            title="Decision Notes"
            description="Your reasoning, recorded now so future-you can audit the decision honestly."
          >
            <div className="flex flex-col gap-5">
              <Field
                label="Purchase Thesis"
                hint="One or two sentences starting with 'I am buying this because...'. Write it before you buy — it is the single best defence against impulse purchases."
              >
                <textarea
                  rows={3}
                  value={form.purchase_thesis}
                  onChange={e => set('purchase_thesis', e.target.value)}
                  placeholder="I am buying this because it is 38% below its 90-day Amazon average and comparable units sell on Willhaben within two weeks."
                  className={TEXTAREA_CLASS}
                />
              </Field>

              <Field
                label="Analysis Notes"
                hint="Anything else worth knowing: competitor prices you checked, listing quality, why the discount exists. Shown as 'Reasoning' on the deal scorecard."
              >
                <textarea
                  rows={3}
                  value={form.ai_decision}
                  onChange={e => set('ai_decision', e.target.value)}
                  placeholder="Leave empty to record this as a manual entry with no automated analysis."
                  className={TEXTAREA_CLASS}
                />
              </Field>

              <Field
                label="Seasonality Notes"
                hint="When to sell. For example 'Bought in September, sell before Christmas' or 'Garden tools — hold until March'."
              >
                <input
                  value={form.seasonality_analysis}
                  onChange={e => set('seasonality_analysis', e.target.value)}
                  placeholder="Bought in September, optimal to sell in the pre-Christmas window."
                  className={INPUT_CLASS}
                />
              </Field>
            </div>
          </Section>

          {/* Willhaben listing */}
          <Section
            icon={<Barcode className="h-5 w-5" />}
            title="Willhaben Listing"
            description="The German text you will publish. Copy it straight out of the workspace when you create the ad."
          >
            <div className="flex flex-col gap-5">
              <Field
                label="Live Willhaben URL"
                hint="Once the ad is actually published on Willhaben, paste its link here. The public storefront's 'Buy on Willhaben' button sends customers straight to it — leave empty and the button shows 'Bald verfügbar' instead."
              >
                <input
                  value={form.willhaben_url}
                  onChange={e => set('willhaben_url', e.target.value)}
                  placeholder="https://www.willhaben.at/iad/object?adId=..."
                  className={`${INPUT_CLASS} font-mono`}
                />
              </Field>

              <Field
                label="Listing Title"
                required
                hint="German, keyword-first, under about 70 characters. Lead with brand and model, then condition."
              >
                <input
                  value={form.listing_title}
                  onChange={e => set('listing_title', e.target.value)}
                  placeholder="Anker Soundcore Q30 Bluetooth Kopfhörer — NEU & OVP"
                  className={INPUT_CLASS}
                />
              </Field>

              <Field
                label="Listing Description"
                required
                hint="German, structured. Cover Zustand (condition), Lieferumfang (what is included), Garantie/Rechnung (warranty/receipt), Übergabe (pickup or shipping) and Bezahlung (payment)."
              >
                <textarea
                  rows={8}
                  value={form.listing_description}
                  onChange={e => set('listing_description', e.target.value)}
                  placeholder={
                    'Zustand: Neu und originalverpackt\n' +
                    'Lieferumfang: Kopfhörer, USB-C Kabel, Transporttasche\n' +
                    'Garantie/Rechnung: Rechnung wird mitgeliefert\n' +
                    'Übergabe: Abholung in Wien oder Versand\n' +
                    'Bezahlung: Bar bei Abholung oder Überweisung'
                  }
                  className={`${TEXTAREA_CLASS} font-mono text-[13px]`}
                />
              </Field>
            </div>
          </Section>

          {/* Actions */}
          <div className="sticky bottom-0 -mx-8 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-white/90 px-8 py-4 backdrop-blur-xl">
            <p className="text-[13px] text-gray-500">
              Fields marked <span className="text-red-500">*</span> are required. Everything else has a sensible default.
            </p>
            <div className="flex gap-3">
              {editingId && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving || deleting}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-white px-4 text-[14px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              )}
              <button
                type="button"
                onClick={editingId ? () => router.push('/admin') : resetForm}
                disabled={saving || deleting}
                className="flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-[14px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                {editingId ? 'Cancel' : 'Clear'}
              </button>
              <button
                type="submit"
                disabled={saving || deleting}
                className="flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-5 text-[14px] font-semibold text-white transition hover:bg-indigo-700 disabled:bg-indigo-300"
              >
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? 'Saving...' : editingId ? 'Update Deal' : 'Save Deal to Workspace'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
