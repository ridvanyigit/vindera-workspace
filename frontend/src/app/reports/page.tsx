'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Package, LogOut, Settings, RefreshCw, BarChart2, PieChart as PieChartIcon, Target, TrendingUp, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Opportunity {
  id: string; status: string; buy_price: number; target_sell_price: number; sold_at: string;
  products: { category: string; };
}

const COLORS = ['#4f46e5', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];
const TAX_LIMIT = 55000;

export default function TaxAndReports() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login');
      else fetchOpportunities();
    });
  }, [router]);

  const fetchOpportunities = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('opportunities').select(`
      id, status, buy_price, target_sell_price, sold_at,
      products ( category )
    `);
    if (!error && data) setOpportunities(data as any);
    setLoading(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  // =======================================================================
  // FINANCIAL CALCULATIONS (Kleinunternehmer Method)
  // =======================================================================
  const soldDeals = opportunities.filter(o => o.status === 'sold');
  
  const totalRevenue = soldDeals.reduce((sum, o) => sum + Number(o.target_sell_price), 0);
  const totalCosts = soldDeals.reduce((sum, o) => sum + Number(o.buy_price), 0);
  const netProfit = totalRevenue - totalCosts;
  const overallRoi = totalCosts > 0 ? ((totalRevenue - totalCosts) / totalCosts) * 100 : 0;
  
  const taxLimitPercentage = Math.min((totalRevenue / TAX_LIMIT) * 100, 100);

  // 1. Data for Monthly Revenue Bar Chart
  const monthlyDataMap: Record<string, { name: string; revenue: number; profit: number }> = {};
  soldDeals.forEach(deal => {
    if (!deal.sold_at) return;
    const month = new Date(deal.sold_at).toLocaleString('default', { month: 'short', year: 'numeric' });
    if (!monthlyDataMap[month]) monthlyDataMap[month] = { name: month, revenue: 0, profit: 0 };
    monthlyDataMap[month].revenue += Number(deal.target_sell_price);
    monthlyDataMap[month].profit += (Number(deal.target_sell_price) - Number(deal.buy_price));
  });
  const monthlyChartData = Object.values(monthlyDataMap);

  // 2. Data for Category Distribution Pie Chart
  const categoryMap: Record<string, number> = {};
  soldDeals.forEach(deal => {
    const cat = deal.products?.category || 'Unknown';
    categoryMap[cat] = (categoryMap[cat] || 0) + Number(deal.target_sell_price);
  });
  const categoryChartData = Object.keys(categoryMap).map(key => ({ name: key, value: categoryMap[key] }));

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* ======================= NAVBAR ======================= */}
      <nav className="sticky top-0 z-50 h-14 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl shrink-0">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-sm"><Package className="h-5 w-5 text-white" /></div>
              <div className="leading-tight"><div className="text-[15px] font-bold tracking-tight text-gray-900">VINDERA</div><div className="text-[9px] font-medium tracking-[0.18em] text-gray-400">WORKSPACE</div></div>
            </div>
            <div className="hidden items-center gap-1 md:flex">
              <button onClick={() => router.push('/')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Workspace</button>
              <button onClick={() => router.push('/products')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Product Master</button>
              <button onClick={() => router.push('/reports')} className="rounded-lg bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">Tax & Reports</button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button title="Settings" className="p-2 text-gray-500 transition rounded-lg hover:bg-gray-100 hover:text-gray-900"><Settings className="h-4 w-4" /></button>
            <div className="h-4 w-px bg-gray-200 mx-1" />
            <button title="Sign out" onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} className="p-2 text-gray-500 transition rounded-lg hover:bg-gray-100 hover:text-red-600"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </nav>

      {/* ======================= REPORTS CONTENT ======================= */}
      <div className="flex-1 p-8 max-w-screen-xl mx-auto w-full flex flex-col gap-6">
        
        <div className="mb-2">
          <h1 className="text-2xl font-extrabold text-gray-900">Tax & Financial Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Einnahmen-Ausgaben tracking for Kleinunternehmen compliance.</p>
        </div>

        {/* TOP KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between text-gray-500"><span className="text-xs font-bold uppercase tracking-wider">Total Revenue</span><Target className="h-4 w-4"/></div>
            <p className="text-2xl font-extrabold text-gray-900">€{totalRevenue.toFixed(2)}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between text-gray-500"><span className="text-xs font-bold uppercase tracking-wider">Net Profit</span><TrendingUp className="h-4 w-4 text-green-500"/></div>
            <p className="text-2xl font-extrabold text-green-600">+€{netProfit.toFixed(2)}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between text-gray-500"><span className="text-xs font-bold uppercase tracking-wider">Average ROI</span><BarChart2 className="h-4 w-4 text-indigo-500"/></div>
            <p className="text-2xl font-extrabold text-indigo-600">{overallRoi.toFixed(1)}%</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between text-gray-500"><span className="text-xs font-bold uppercase tracking-wider">Units Sold</span><Package className="h-4 w-4"/></div>
            <p className="text-2xl font-extrabold text-gray-900">{soldDeals.length} Items</p>
          </div>
        </div>

        {/* TAX LIMIT BAR (Austrian Kleinunternehmer) */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex justify-between items-end mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500"/> Kleinunternehmer Limit (Annual)</h3>
              <p className="text-xs text-gray-500 mt-1">If revenue exceeds €55,000 you must charge VAT (Umsatzsteuer).</p>
            </div>
            <div className="text-right">
              <span className="text-lg font-bold text-gray-900">€{totalRevenue.toFixed(2)}</span>
              <span className="text-xs text-gray-500 font-medium"> / €55,000.00</span>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div className={`h-3 rounded-full ${taxLimitPercentage > 80 ? 'bg-red-500' : taxLimitPercentage > 50 ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{ width: `${taxLimitPercentage}%` }}></div>
          </div>
        </div>

        {/* CHARTS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-96">
          {/* Bar Chart */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><BarChart2 className="h-4 w-4 text-indigo-500"/> Monthly Revenue & Profit</h3>
            <div className="flex-1">
              {monthlyChartData.length === 0 ? <div className="h-full flex items-center justify-center text-sm text-gray-400">No sales data yet.</div> :
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => `€${v}`} />
                    {/* Fixed strict types by passing any to formatter */}
                    <Tooltip cursor={{ fill: '#f9fafb' }} formatter={(value: any) => `€${Number(value).toFixed(2)}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                    <Bar dataKey="revenue" name="Revenue (Umsatz)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Net Profit (Gewinn)" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              }
            </div>
          </div>

          {/* Pie Chart */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
            <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2"><PieChartIcon className="h-4 w-4 text-indigo-500"/> Revenue by Category</h3>
            <div className="flex-1">
              {categoryChartData.length === 0 ? <div className="h-full flex items-center justify-center text-sm text-gray-400">No category data yet.</div> :
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    {/* Fixed strict types by typing props explicitly */}
                    <Pie data={categoryChartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={(props: any) => `${props.name} ${(props.percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: '10px', fontWeight: 'bold' }}>
                      {categoryChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: any) => `€${Number(value).toFixed(2)}`} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              }
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}