'use client';

/** Tax & financial reports — revenue, profit, VAT threshold and category mix. */

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { checkIsAdmin } from '@/lib/auth';
import { apiFetch } from '@/lib/apiFetch';
import { EXPENSE_CATEGORIES } from '@/lib/constants';
import { useRouter } from 'next/navigation';
import { Package, LogOut, RefreshCw, BarChart2, PieChart as PieChartIcon, Target, TrendingUp, AlertTriangle, Receipt, Trash2, Repeat, Sun, Moon } from 'lucide-react';
import { useDarkMode } from '@/lib/useDarkMode';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Opportunity {
  id: string; status: string; buy_price: number; target_sell_price: number; sold_at: string;
  products: { category: string; };
}

interface Expense {
  id: string; description: string; amount: number; category: string; incurred_at: string; is_recurring: boolean;
}

const COLORS = ['#4f46e5', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];
const TAX_LIMIT = 55000;

/** Local calendar date as YYYY-MM-DD, the format <input type="date"> and the API use. */
const todayIso = () => new Date().toLocaleDateString('en-CA');

const emptyExpenseForm = () => ({
  description: '', amount: '', category: EXPENSE_CATEGORIES[0].value, incurred_at: todayIso(), is_recurring: false,
});

const formatEuro = (value: number) => `${value < 0 ? '-' : ''}€${Math.abs(value).toFixed(2)}`;

export default function TaxAndReports() {
  const router = useRouter();
  const { dark, toggle: toggleDark } = useDarkMode();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState(emptyExpenseForm);
  const [savingExpense, setSavingExpense] = useState(false);
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOpportunities = async () => {
    const { data, error } = await supabase.from('opportunities').select(`
      id, status, buy_price, target_sell_price, sold_at,
      products ( category )
    `);
    if (!error && data) setOpportunities(data as any);
  };

  const fetchExpenses = async () => {
    const { data, error } = await supabase
      .from('business_expenses')
      .select('id, description, amount, category, incurred_at, is_recurring')
      .order('incurred_at', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      setExpensesError(error.message);
      return;
    }
    setExpensesError(null);
    setExpenses((data ?? []) as Expense[]);
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/admin/login'); return; }
      if (!(await checkIsAdmin())) { router.push('/'); return; }
      setLoading(true);
      // Wait for both so net profit never flashes without its expenses.
      await Promise.all([fetchOpportunities(), fetchExpenses()]);
      setLoading(false);
    });
  }, [router]);

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
      await fetchExpenses();
    } catch (err) {
      setExpenseFormError(err instanceof Error ? err.message : 'Could not save the expense.');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (expense: Expense) => {
    if (!window.confirm(`Delete "${expense.description}" (€${Number(expense.amount).toFixed(2)})?`)) return;
    setExpenseFormError(null);
    try {
      await apiFetch(`/expenses/${expense.id}`, { method: 'DELETE' });
      await fetchExpenses();
    } catch (err) {
      setExpenseFormError(err instanceof Error ? err.message : 'Could not delete the expense.');
    }
  };

  if (loading) return <div className="vindera-admin min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  // =======================================================================
  // Financial calculations (Austrian small-business / VAT-exempt method)
  // =======================================================================
  const soldDeals = opportunities.filter(o => o.status === 'sold');
  
  const totalRevenue = soldDeals.reduce((sum, o) => sum + Number(o.target_sell_price), 0);
  const totalCosts = soldDeals.reduce((sum, o) => sum + Number(o.buy_price), 0);
  const grossProfit = totalRevenue - totalCosts;
  // Every recorded expense counts (recurring and one-off): net profit is what is left after all business costs.
  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const netProfit = grossProfit - totalExpenses;
  const overallRoi = totalCosts > 0 ? ((totalRevenue - totalCosts) / totalCosts) * 100 : 0;

  const taxLimitPercentage = Math.min((totalRevenue / TAX_LIMIT) * 100, 100);

  // Monthly revenue & net profit series for the bar chart. Keyed by YYYY-MM so
  // months sort chronologically; months with expenses but no sales still appear.
  const monthlyDataMap: Record<string, { name: string; revenue: number; profit: number }> = {};
  const monthBucket = (key: string) => {
    if (!monthlyDataMap[key]) {
      const [year, month] = key.split('-').map(Number);
      const name = new Date(year, month - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
      monthlyDataMap[key] = { name, revenue: 0, profit: 0 };
    }
    return monthlyDataMap[key];
  };
  soldDeals.forEach(deal => {
    if (!deal.sold_at) return;
    const soldAt = new Date(deal.sold_at);
    const bucket = monthBucket(`${soldAt.getFullYear()}-${String(soldAt.getMonth() + 1).padStart(2, '0')}`);
    bucket.revenue += Number(deal.target_sell_price);
    bucket.profit += (Number(deal.target_sell_price) - Number(deal.buy_price));
  });
  // `incurred_at` is a plain date (YYYY-MM-DD), so the month is read from the string, not a timezone-shifted Date.
  expenses.forEach(expense => {
    monthBucket(expense.incurred_at.slice(0, 7)).profit -= Number(expense.amount);
  });
  const monthlyChartData = Object.keys(monthlyDataMap).sort().map(key => monthlyDataMap[key]);

  // Revenue split by category for the pie chart.
  const categoryMap: Record<string, number> = {};
  soldDeals.forEach(deal => {
    const cat = deal.products?.category || 'Unknown';
    categoryMap[cat] = (categoryMap[cat] || 0) + Number(deal.target_sell_price);
  });
  const categoryChartData = Object.keys(categoryMap).map(key => ({ name: key, value: categoryMap[key] }));

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
        
        <div className="mb-2">
          <h1 className="type-page-title text-gray-900">Tax & Financial Reports</h1>
          <p className="text-[13px] text-gray-500 mt-1">Income and expense tracking for Austrian small-business tax compliance.</p>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between text-gray-500"><span className="type-label">Total Revenue</span><Target className="h-4 w-4"/></div>
            <p className="type-metric text-gray-900">€{totalRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between text-gray-500"><span className="type-label">Net Profit</span><TrendingUp className={`h-4 w-4 ${netProfit < 0 ? 'text-red-500' : 'text-green-500'}`}/></div>
            <p className={`type-metric ${netProfit < 0 ? 'text-red-600' : 'text-green-600'}`}>{netProfit >= 0 ? '+' : ''}{formatEuro(netProfit)}</p>
            <p className="text-[12px] text-gray-500 tabular-nums">
              {expensesError ? 'Expenses could not be loaded — figure excludes them' : `Gross ${formatEuro(grossProfit)} − Expenses ${formatEuro(totalExpenses)}`}
            </p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between text-gray-500"><span className="type-label">Average ROI</span><BarChart2 className="h-4 w-4 text-indigo-500"/></div>
            <p className="type-metric text-indigo-600">{overallRoi.toFixed(1)}%</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between text-gray-500"><span className="type-label">Units Sold</span><Package className="h-4 w-4"/></div>
            <p className="type-metric text-gray-900">{soldDeals.length} Items</p>
          </div>
        </div>

        {/* VAT exemption threshold (Austrian small business) */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-end mb-3">
            <div>
              <h3 className="type-section-title text-gray-800 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500"/> Small Business VAT Exemption Limit (Annual)</h3>
              <p className="text-[13px] text-gray-500 mt-1">If revenue exceeds €55,000 you must start charging VAT.</p>
            </div>
            <div className="text-right">
              <span className="text-[17px] font-semibold tabular-nums tracking-[-0.015em] text-gray-900">€{totalRevenue.toFixed(2)}</span>
              <span className="text-[13px] text-gray-500 font-medium tabular-nums"> / €55,000.00</span>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div className={`h-3 rounded-full ${taxLimitPercentage > 80 ? 'bg-red-500' : taxLimitPercentage > 50 ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{ width: `${taxLimitPercentage}%` }}></div>
          </div>
        </div>

        {/* CHARTS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-96">
          {/* Bar Chart */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <h3 className="type-section-title text-gray-800 mb-4 flex items-center gap-2"><BarChart2 className="h-4 w-4 text-indigo-500"/> Monthly Revenue & Profit</h3>
            <div className="flex-1">
              {monthlyChartData.length === 0 ? <div className="h-full flex items-center justify-center text-[13px] text-gray-400">No sales data yet.</div> :
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
                    {/* recharts ships loose formatter types; `any` avoids a false positive under strict mode. */}
                    <Tooltip cursor={{ fill: dark ? '#21262d' : '#f9fafb' }} formatter={(value: any) => `€${Number(value).toFixed(2)}`} contentStyle={tooltipStyle} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Net Profit" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              }
            </div>
          </div>

          {/* Pie Chart */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <h3 className="type-section-title text-gray-800 mb-4 flex items-center gap-2"><PieChartIcon className="h-4 w-4 text-indigo-500"/> Revenue by Category</h3>
            <div className="flex-1">
              {categoryChartData.length === 0 ? <div className="h-full flex items-center justify-center text-[13px] text-gray-400">No category data yet.</div> :
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
              <span className="type-label text-gray-500">Total</span>
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
              <div className="py-8 text-center text-[13px] text-gray-400">No expenses recorded yet.</div>
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
    </div>
  );
}