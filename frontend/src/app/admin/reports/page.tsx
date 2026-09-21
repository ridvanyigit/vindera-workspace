'use client';

/**
 * Tax & financial reports for one calendar year.
 *
 * All figures come from the backend (GET /reports/summary), aggregated from the
 * sales ledger, the units and the expenses: the browser only lists rows (in pages)
 * and never sums a table that could be cut off at 1000 rows.
 */

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { checkIsAdmin } from '@/lib/auth';
import { apiDownload, apiFetch, errorMessage } from '@/lib/apiFetch';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import { fetchAllRows } from '@/lib/fetchAll';
import type { ReportSummary } from '@/lib/reportTypes';
import { ToastStack, useToasts } from '@/components/Toast';
import { useRouter } from 'next/navigation';
import { Package, LogOut, RefreshCw, BarChart2, PieChart as PieChartIcon, Target, TrendingUp, AlertTriangle, Receipt, Trash2, Repeat, Sun, Moon, Download, Info } from 'lucide-react';
import { useDarkMode } from '@/lib/useDarkMode';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Expense {
  id: string; description: string; amount: number; category: string; incurred_at: string; is_recurring: boolean;
}

type View = 'management' | 'cash';

const COLORS = ['#4f46e5', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];

/** Local calendar date as YYYY-MM-DD, the format <input type="date"> and the API use. */
const todayIso = () => new Date().toLocaleDateString('en-CA');

const emptyExpenseForm = () => ({
  description: '', amount: '', category: EXPENSE_CATEGORIES[0].value, incurred_at: todayIso(), is_recurring: false,
});

const formatEuro = (value: number) => `${value < 0 ? '-' : ''}€${Math.abs(value).toFixed(2)}`;

export default function TaxAndReports() {
  const router = useRouter();
  const { dark, toggle: toggleDark } = useDarkMode();
  const toasts = useToasts();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [view, setView] = useState<View>('management');
  const [report, setReport] = useState<ReportSummary | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [decimalComma, setDecimalComma] = useState(true);

  const fetchReport = useCallback(async (forYear: number) => {
    try {
      setReport(await apiFetch<ReportSummary>(`/reports/summary?year=${forYear}`));
      setReportError(null);
    } catch (err) {
      setReport(null);
      setReportError(errorMessage(err, 'Could not load the report.'));
    }
  }, []);

  const fetchExpenses = useCallback(async (forYear: number) => {
    try {
      const rows = await fetchAllRows<Expense>((from, to) =>
        supabase
          .from('business_expenses')
          .select('id, description, amount, category, incurred_at, is_recurring')
          .gte('incurred_at', `${forYear}-01-01`)
          .lt('incurred_at', `${forYear + 1}-01-01`)
          .order('incurred_at', { ascending: false })
          .order('id')
          .range(from, to),
      );
      setExpenses(rows);
      setExpensesError(null);
    } catch (err) {
      setExpensesError(errorMessage(err, 'Could not load the expenses.'));
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/admin/login'); return; }
      if (!(await checkIsAdmin())) { router.push('/'); return; }
      setReady(true);
    });
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    // Wait for both so a year never shows figures without its expenses.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag around the fetch
    setLoading(true);
    Promise.all([fetchReport(year), fetchExpenses(year)]).finally(() => setLoading(false));
  }, [ready, year, fetchReport, fetchExpenses]);

  /** Writes go through the FastAPI backend (service role); the browser can only read. */
  const handleAddExpense = async (e: FormEvent) => {
    e.preventDefault();
    setSavingExpense(true);
    setExpenseFormError(null);
    try {
      await apiFetch('/expenses/', {
        method: 'POST',
        json: {
          description: expenseForm.description.trim(),
          amount: Number(expenseForm.amount),
          category: expenseForm.category,
          incurred_at: expenseForm.incurred_at || null,
          is_recurring: expenseForm.is_recurring,
        },
      });
      setExpenseForm(prev => ({ ...prev, description: '', amount: '', is_recurring: false }));
      toasts.success('Expense added.');
      await Promise.all([fetchExpenses(year), fetchReport(year)]);
    } catch (err) {
      setExpenseFormError(errorMessage(err, 'Could not save the expense.'));
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!window.confirm(`Delete "${expense.description}" (€${Number(expense.amount).toFixed(2)})?`)) return;
    setExpenseFormError(null);
    try {
      await apiFetch(`/expenses/${expense.id}`, { method: 'DELETE' });
      toasts.success('Expense deleted.');
      await Promise.all([fetchExpenses(year), fetchReport(year)]);
    } catch (err) {
      setExpenseFormError(errorMessage(err, 'Could not delete the expense.'));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await apiDownload(`/reports/export.csv?year=${year}&decimal_comma=${decimalComma}`, `vindera-buchungen-${year}.csv`);
    } catch (err) {
      toasts.error(errorMessage(err, 'Could not export the bookings.'));
    } finally {
      setExporting(false);
    }
  };

  if (!ready || (loading && !report && !reportError)) return <div className="vindera-admin min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  const currentYear = new Date().getFullYear();
  const years = Array.from(new Set([...(report?.available_years ?? []), currentYear, year])).sort((a, b) => b - a);

  const m = report?.management;
  const cash = report?.cash;
  const vat = report?.vat;
  const vatPct = Number(vat?.pct ?? 0);
  const vatBarWidth = Math.min(vatPct, 100);
  const vatTone = vatPct >= 95 ? 'bg-red-500' : vatPct >= Number(vat?.warn_pct ?? 80) ? 'bg-amber-400' : 'bg-indigo-500';

  // Monthly revenue and profit after expenses. `incurred_at` is a plain date (YYYY-MM-DD),
  // so the month is read from the string, not from a timezone-shifted Date.
  const expensesByMonth = new Array<number>(12).fill(0);
  expenses.forEach(expense => { expensesByMonth[Number(expense.incurred_at.slice(5, 7)) - 1] += Number(expense.amount); });
  const monthlyChartData = (m?.monthly ?? []).map(row => ({
    name: new Date(year, row.month - 1, 1).toLocaleString('default', { month: 'short' }),
    revenue: Number(row.revenue),
    profit: Number(row.gross_profit) - expensesByMonth[row.month - 1],
  }));
  const hasMonthlyData = monthlyChartData.some(row => row.revenue !== 0 || row.profit !== 0);

  const categoryChartData = (m?.by_category ?? []).filter(row => Number(row.revenue) > 0).map(row => ({ name: row.category, value: Number(row.revenue) }));
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // Recharts draws inline styles, which the CSS overrides can't reach.
  const tooltipStyle = {
    borderRadius: '8px',
    border: dark ? '1px solid #30363d' : 'none',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    backgroundColor: dark ? '#161b22' : '#ffffff',
    color: dark ? '#e6edf3' : '#111827',
  };
  const gridStroke = dark ? '#21262d' : '#f3f4f6';

  return (
    <div className="vindera-admin min-h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 h-14 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl shrink-0">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-sm"><Package className="h-5 w-5 text-white" /></div>
              <div className="leading-tight"><div className="text-[15px] font-semibold tracking-[-0.01em] text-gray-900">VINDERA</div><div className="text-[9px] font-medium tracking-[0.18em] text-gray-400">WORKSPACE</div></div>
            </div>
            <div className="hidden items-center gap-1 md:flex">
              <button onClick={() => router.push('/admin')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Workspace</button>
              <button onClick={() => router.push('/admin/products')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Product Master</button>
              <button onClick={() => router.push('/admin/manual-entry')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Manual Entry</button>
              <button onClick={() => router.push('/admin/reports')} className="rounded-lg bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">Tax & Reports</button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-4 w-px bg-gray-200 mx-1" />
            <button onClick={toggleDark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'} className="p-2 text-gray-500 transition rounded-lg hover:bg-gray-100 hover:text-gray-900">
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button title="Sign out" onClick={async () => { await supabase.auth.signOut(); router.push('/admin/login'); }} className="p-2 text-gray-500 transition rounded-lg hover:bg-gray-100 hover:text-red-600"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </nav>

      {/* REPORTS CONTENT */}
      <div className="flex-1 p-8 max-w-screen-xl mx-auto w-full flex flex-col gap-6">

        <div className="mb-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="type-page-title text-gray-900">Tax & Financial Reports</h1>
            <p className="text-[13px] text-gray-500 mt-1">Income and expense tracking for Austrian small-business tax compliance, per calendar year.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] text-gray-600">
              <span className="type-label text-gray-500">Year</span>
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <div className="flex rounded-lg bg-gray-200 p-1">
              <button onClick={() => setView('management')} className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors ${view === 'management' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>Management view</button>
              <button onClick={() => setView('cash')} className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors ${view === 'cash' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>Cash (E/A) view</button>
            </div>
            <label className="flex items-center gap-1.5 text-[12px] text-gray-500 cursor-pointer" title="Amounts in the CSV use a comma as decimal separator (12,50)">
              <input type="checkbox" checked={decimalComma} onChange={e => setDecimalComma(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300" /> Decimal comma
            </label>
            <button onClick={handleExport} disabled={exporting} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-indigo-300">
              <Download className="h-4 w-4" /> {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        {reportError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            The report for {year} could not be loaded: {reportError}
            <button onClick={() => { setLoading(true); Promise.all([fetchReport(year), fetchExpenses(year)]).finally(() => setLoading(false)); }} className="ml-3 font-semibold underline">Retry</button>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-[12px] text-gray-500">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-indigo-500" />
          <span>
            <strong className="text-gray-700">Management view</strong> counts a purchase only when the item is sold (profit per sale).{' '}
            <strong className="text-gray-700">Cash (E/A) view</strong> counts money when it moves: purchases in the year they were paid. Tax treatment to be confirmed with your Steuerberater.
          </span>
        </div>

        {m && cash && view === 'management' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between text-gray-500"><span className="type-label">Revenue {year}</span><Target className="h-4 w-4"/></div>
              <p className="type-metric text-gray-900">€{Number(m.revenue).toFixed(2)}</p>
              <p className="text-[12px] text-gray-500">Refunds already deducted</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between text-gray-500"><span className="type-label">Gewinn vor Steuern</span><TrendingUp className={`h-4 w-4 ${Number(m.profit_before_tax) < 0 ? 'text-red-500' : 'text-green-500'}`}/></div>
              <p className={`type-metric ${Number(m.profit_before_tax) < 0 ? 'text-red-600' : 'text-green-600'}`}>{Number(m.profit_before_tax) >= 0 ? '+' : ''}{formatEuro(Number(m.profit_before_tax))}</p>
              <p className="text-[12px] text-gray-500 tabular-nums">
                {expensesError ? 'Expenses could not be loaded' : `Gross ${formatEuro(Number(m.gross_profit))} − Expenses ${formatEuro(Number(m.expenses_total))}`}
              </p>
              <p className="text-[11px] text-gray-400">vor Einkommensteuer und SVS</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between text-gray-500"><span className="type-label">Average ROI</span><BarChart2 className="h-4 w-4 text-indigo-500"/></div>
              <p className="type-metric text-indigo-600">{m.roi_pct === null ? '–' : `${Number(m.roi_pct).toFixed(1)}%`}</p>
              <p className="text-[12px] text-gray-500">Gross profit / cost of goods sold</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between text-gray-500"><span className="type-label">Units Sold</span><Package className="h-4 w-4"/></div>
              <p className="type-metric text-gray-900">{m.units_sold} Items</p>
              <p className="text-[12px] text-gray-500 tabular-nums">Cost {formatEuro(Number(m.cogs))} · Shipping {formatEuro(Number(m.shipping))} · Fees {formatEuro(Number(m.platform_fees))}</p>
            </div>
          </div>
        )}

        {m && cash && view === 'cash' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
                <div className="flex items-center justify-between text-gray-500"><span className="type-label">Income {year}</span><Target className="h-4 w-4"/></div>
                <p className="type-metric text-gray-900">€{Number(cash.income).toFixed(2)}</p>
                <p className="text-[12px] text-gray-500">By date of sale / refund</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
                <div className="flex items-center justify-between text-gray-500"><span className="type-label">Purchases</span><Package className="h-4 w-4"/></div>
                <p className="type-metric text-gray-900">{formatEuro(Number(cash.purchases))}</p>
                <p className="text-[12px] text-gray-500">By purchase date, incl. items still in stock</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
                <div className="flex items-center justify-between text-gray-500"><span className="type-label">Other outgoings</span><Receipt className="h-4 w-4"/></div>
                <p className="type-metric text-gray-900">{formatEuro(Number(cash.shipping) + Number(cash.platform_fees) + Number(cash.expenses))}</p>
                <p className="text-[12px] text-gray-500 tabular-nums">Shipping {formatEuro(Number(cash.shipping))} · Fees {formatEuro(Number(cash.platform_fees))} · Expenses {formatEuro(Number(cash.expenses))}</p>
              </div>
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
                <div className="flex items-center justify-between text-gray-500"><span className="type-label">Cash result</span><TrendingUp className={`h-4 w-4 ${Number(cash.result) < 0 ? 'text-red-500' : 'text-green-500'}`}/></div>
                <p className={`type-metric ${Number(cash.result) < 0 ? 'text-red-600' : 'text-green-600'}`}>{Number(cash.result) >= 0 ? '+' : ''}{formatEuro(Number(cash.result))}</p>
                <p className="text-[11px] text-gray-400">Income minus all outgoings; not a tax figure</p>
              </div>
            </div>
            {cash.purchases_estimated_date > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
                {cash.purchases_estimated_date} purchase{cash.purchases_estimated_date === 1 ? ' has' : 's have'} no recorded purchase date; the receipt or scan date was used. Check them before you hand the numbers to your Steuerberater.
              </div>
            )}
          </>
        )}

        {/* VAT exemption threshold (Austrian small business), for the selected calendar year */}
        {vat && (
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex justify-between items-end mb-3">
              <div>
                <h3 className="type-section-title text-gray-800 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500"/> Small Business VAT Exemption Limit ({year})</h3>
                <p className="text-[13px] text-gray-500 mt-1">If revenue in a calendar year exceeds €{Number(vat.threshold).toLocaleString('de-AT')} you must start charging VAT. Confirm the exact rules (including tolerance) with your Steuerberater.</p>
              </div>
              <div className="text-right">
                <span className="text-[17px] font-semibold tabular-nums tracking-[-0.015em] text-gray-900">€{Number(vat.revenue).toFixed(2)}</span>
                <span className="text-[13px] text-gray-500 font-medium tabular-nums"> / €{Number(vat.threshold).toLocaleString('de-AT', { minimumFractionDigits: 2 })}</span>
                <p className="text-[12px] text-gray-500 tabular-nums">{vatPct.toFixed(1)}% used</p>
              </div>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-3">
              <div className={`h-3 rounded-full ${vatTone}`} style={{ width: `${vatBarWidth}%` }}></div>
            </div>
          </div>
        )}

        {/* CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-96">
          {/* Bar Chart */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <h3 className="type-section-title text-gray-800 mb-4 flex items-center gap-2"><BarChart2 className="h-4 w-4 text-indigo-500"/> Monthly Revenue & Profit</h3>
            <div className="flex-1">
              {!hasMonthlyData ? <div className="h-full flex items-center justify-center text-[13px] text-gray-400">No sales in {year}.</div> :
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
                    {/* recharts ships loose formatter types; `any` avoids a false positive under strict mode. */}
                    <Tooltip cursor={{ fill: dark ? '#21262d' : '#f9fafb' }} formatter={(value: any) => `€${Number(value).toFixed(2)}`} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Profit after expenses" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              }
            </div>
          </div>

          {/* Pie Chart */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <h3 className="type-section-title text-gray-800 mb-4 flex items-center gap-2"><PieChartIcon className="h-4 w-4 text-indigo-500"/> Revenue by Category</h3>
            <div className="flex-1">
              {categoryChartData.length === 0 ? <div className="h-full flex items-center justify-center text-[13px] text-gray-400">No category data for {year}.</div> :
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    {/* recharts ships loose label-render types; `any` avoids a false positive under strict mode. */}
                    <Pie data={categoryChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={(props: any) => `${props.name} ${(props.percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: '10px', fontWeight: 'bold' }}>
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `€${Number(value).toFixed(2)}`} contentStyle={tooltipStyle} itemStyle={{ color: tooltipStyle.color }} />
                  </PieChart>
                </ResponsiveContainer>
              }
            </div>
          </div>
        </div>

        {/* BUSINESS EXPENSES */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h3 className="type-section-title text-gray-800 flex items-center gap-2"><Receipt className="h-4 w-4 text-indigo-500"/> Business Expenses</h3>
              <p className="type-body text-gray-500 mt-1">Costs that don&apos;t belong to a single deal — rent, packaging, subscriptions. They are subtracted from gross profit. Enter a recurring cost once per payment.</p>
            </div>
            <div className="text-right shrink-0 pl-4">
              <span className="type-label text-gray-500">Total {year}</span>
              <p className="text-[17px] font-semibold tabular-nums tracking-[-0.015em] text-gray-900">€{totalExpenses.toFixed(2)}</p>
            </div>
          </div>

          <form onSubmit={handleAddExpense} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end mb-2">
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="type-label text-gray-500">Description</span>
              <input required value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="e.g. Storage unit rent" className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </label>
            <label className="md:col-span-2 flex flex-col gap-1">
              <span className="type-label text-gray-500">Amount (€)</span>
              <input required type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })} placeholder="0.00" className="rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-indigo-400" />
            </label>
            <label className="md:col-span-3 flex flex-col gap-1">
              <span className="type-label text-gray-500">Category</span>
              <select value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400">
                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="md:col-span-2 flex flex-col gap-1">
              <span className="type-label text-gray-500">Date</span>
              <input required type="date" value={expenseForm.incurred_at} onChange={e => setExpenseForm({ ...expenseForm, incurred_at: e.target.value })} className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            </label>
            <div className="md:col-span-2 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer">
                <input type="checkbox" checked={expenseForm.is_recurring} onChange={e => setExpenseForm({ ...expenseForm, is_recurring: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded border-gray-300" />
                Recurring
              </label>
              <button type="submit" disabled={savingExpense || !expenseForm.description.trim() || !(Number(expenseForm.amount) > 0)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-indigo-300">{savingExpense ? 'Saving...' : 'Add'}</button>
            </div>
          </form>

          {expenseFormError && <p className="text-[13px] text-red-600 mt-2">{expenseFormError}</p>}
          {expensesError && <p className="text-[13px] text-red-600 mt-2">Could not load expenses: {expensesError}</p>}

          <div className="mt-4 overflow-x-auto">
            {expenses.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-gray-400">No expenses recorded for {year}.</div>
            ) : (
              <table className="w-full text-left text-sm text-gray-600">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="type-label text-gray-500 py-2 pr-4">Date</th>
                    <th className="type-label text-gray-500 py-2 pr-4">Description</th>
                    <th className="type-label text-gray-500 py-2 pr-4">Category</th>
                    <th className="type-label text-gray-500 py-2 pr-4 text-right">Amount</th>
                    <th className="py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(expense => (
                    <tr key={expense.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-4 tabular-nums whitespace-nowrap">{expense.incurred_at}</td>
                      <td className="py-2.5 pr-4 text-gray-900">
                        {expense.description}
                        {expense.is_recurring && <span className="ml-2 inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-indigo-600 align-middle"><Repeat className="h-3 w-3"/> Recurring</span>}
                      </td>
                      <td className="py-2.5 pr-4">{expense.category}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-semibold text-gray-900">€{Number(expense.amount).toFixed(2)}</td>
                      <td className="py-2.5 text-right"><button title="Delete expense" onClick={() => handleDeleteExpense(expense)} className="p-1.5 text-gray-400 transition rounded-lg hover:bg-gray-100 hover:text-red-600"><Trash2 className="h-4 w-4"/></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
      <ToastStack toasts={toasts.toasts} dismiss={toasts.dismiss} />
    </div>
  );
}