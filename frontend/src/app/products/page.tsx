'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Package, LogOut, Settings, RefreshCw, Search, ArrowUpDown, Download, Filter } from 'lucide-react';
import { differenceInDays } from 'date-fns';

interface Opportunity {
  id: string;
  sku: string;
  status: string;
  buy_price: number;
  target_sell_price: number;
  profit_margin: number;
  deal_score: number;
  created_at: string;
  products: { title: string; asin: string; category: string };
}

type Column = 'sku' | 'product' | 'status' | 'buy' | 'sell' | 'margin' | 'score' | 'age';

const initialWidths: Record<Column, number> = {
  sku: 150, product: 380, status: 150, buy: 130,
  sell: 140, margin: 140, score: 120, age: 120,
};

const minWidths: Record<Column, number> = {
  sku: 90, product: 180, status: 100, buy: 90,
  sell: 90, margin: 100, score: 90, age: 80,
};

const columns: Column[] = ['sku', 'product', 'status', 'buy', 'sell', 'margin', 'score', 'age'];

export default function ProductMaster() {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [widths, setWidths] = useState(initialWidths);
  const [resizing, setResizing] = useState<Column | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  useEffect(() => { fetchOpportunities(); }, []);

  const fetchOpportunities = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('opportunities')
      .select(`
        id, sku, status, buy_price, target_sell_price, profit_margin,
        deal_score, created_at, products (title, asin, category)
      `)
      .order('created_at', { ascending: false });

    if (!error && data) setOpportunities(data as unknown as Opportunity[]);
    setLoading(false);
  };

  const startResize = (column: Column, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(column);
    setStartX(e.clientX);
    setStartWidth(widths[column]);
  };

  useEffect(() => {
    if (!resizing) return;

    const move = (e: PointerEvent) => {
      const delta = e.clientX - startX;
      setWidths(current => ({
        ...current,
        [resizing]: Math.max(minWidths[resizing], startWidth + delta),
      }));
    };

    const stop = () => setResizing(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [resizing, startX, startWidth]);

  const filteredOpportunities = opportunities.filter(item => {
    const search = searchTerm.toLowerCase();
    return (
      item.products?.title?.toLowerCase().includes(search) ||
      item.sku?.toLowerCase().includes(search) ||
      item.products?.asin?.toLowerCase().includes(search)
    );
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'inventory': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'sold': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  const exportCSV = () => {
    const headers = ['SKU', 'Product', 'ASIN', 'Category', 'Status', 'Buy Price', 'Target Sell', 'ROI / Margin', 'AI Score', 'Age'];
    const rows = filteredOpportunities.map(item => [
      item.sku, item.products?.title, item.products?.asin, item.products?.category,
      item.status, item.buy_price, item.target_sell_price, item.profit_margin,
      item.deal_score, differenceInDays(new Date(), new Date(item.created_at)),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'product-master.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const ResizeHandle = ({ column }: { column: Column }) => (
    <span
      onPointerDown={e => startResize(column, e)}
      className="absolute right-0 top-0 z-30 flex h-full w-4 translate-x-1/2 cursor-col-resize items-center justify-center touch-none select-none"
    >
      <span className={`h-7 w-px rounded-full transition-all duration-150 ${
        resizing === column
          ? 'w-[2px] bg-indigo-600'
          : 'bg-gray-300 opacity-70 group-hover:bg-indigo-400 group-hover:opacity-100'
      }`} />
    </span>
  );

  const Header = ({ column, children, last = false }: {
    column: Column;
    children: React.ReactNode;
    last?: boolean;
  }) => (
    <th
      className="group relative h-12 border-b border-r border-gray-200 bg-gray-50/95 px-4 text-center align-middle"
      style={{ width: widths[column], minWidth: widths[column], maxWidth: widths[column] }}
    >
      <div className="flex h-full items-center justify-center gap-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {children}
      </div>
      {!last && <ResizeHandle column={column} />}
    </th>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">

      <nav className="sticky top-0 z-50 h-14 shrink-0 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-sm">
                <Package className="h-5 w-5 text-white" />
              </div>
              <div className="leading-tight">
                <div className="text-[15px] font-bold tracking-tight text-gray-900">VINDERA</div>
                <div className="text-[9px] font-medium tracking-[0.18em] text-gray-400">WORKSPACE</div>
              </div>
            </div>

            <div className="hidden items-center gap-1 md:flex">
              <button onClick={() => router.push('/')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
                Workspace
              </button>
              <button onClick={() => router.push('/products')} className="rounded-lg bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">
                Product Master
              </button>
              <button onClick={() => router.push('/reports')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
                Tax & Reports
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button title="Settings" className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
              <Settings className="h-4 w-4" />
            </button>
            <div className="mx-1 h-4 w-px bg-gray-200" />
            <button
              title="Sign out"
              onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }}
              className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Products</h2>
            <p className="mt-0.5 text-xs text-gray-400">{filteredOpportunities.length} records</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search SKU, ASIN or product..."
                className="h-9 w-72 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-xs text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
              />
            </div>

            <button
              onClick={fetchOpportunities}
              className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>

            <button
              onClick={exportCSV}
              className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table
            className="table-fixed border-separate border-spacing-0 text-left text-sm"
            style={{
              width: '100%',
              minWidth: Object.values(widths).reduce((total, width) => total + width, 0),
            }}
          >
            <colgroup>
              {columns.map(column => <col key={column} style={{ width: widths[column] }} />)}
            </colgroup>

            <thead>
              <tr>
                <Header column="sku">SKU <ArrowUpDown className="h-3 w-3 text-gray-400" /></Header>
                <Header column="product">Product Details</Header>
                <Header column="status">Status <Filter className="h-3 w-3 text-gray-400" /></Header>
                <Header column="buy">Buy Price</Header>
                <Header column="sell">Target Sell</Header>
                <Header column="margin">ROI / Margin</Header>
                <Header column="score">AI Score</Header>
                <Header column="age" last>Age (Days)</Header>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="h-40 text-center text-xs text-gray-400">
                    Loading products...
                  </td>
                </tr>
              ) : filteredOpportunities.length === 0 ? (
                <tr>
                  <td colSpan={8} className="h-40 text-center text-xs text-gray-400">
                    No products found.
                  </td>
                </tr>
              ) : (
                filteredOpportunities.map(item => {
                  const age = differenceInDays(new Date(), new Date(item.created_at));

                  return (
                    <tr key={item.id} className="group transition-colors hover:bg-gray-50/80">

                      <td className="border-r border-gray-100 px-4 py-4 align-middle" style={{ width: widths.sku, minWidth: widths.sku }}>
                        <span className="block truncate font-mono text-xs font-medium text-gray-600">
                          {item.sku || '—'}
                        </span>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 align-middle" style={{ width: widths.product, minWidth: widths.product }}>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-gray-800">
                            {item.products?.title || 'Unknown Product'}
                          </div>
                          <div className="mt-1 truncate text-[11px] text-gray-400">
                            {item.products?.asin || '—'}
                            {item.products?.category ? ` · ${item.products.category}` : ''}
                          </div>
                        </div>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle" style={{ width: widths.status, minWidth: widths.status }}>
                        <span className={`inline-flex rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${getStatusStyle(item.status)}`}>
                          {item.status}
                        </span>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle tabular-nums" style={{ width: widths.buy, minWidth: widths.buy }}>
                        <span className="text-xs font-semibold text-gray-700">
                          €{Number(item.buy_price || 0).toFixed(2)}
                        </span>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle tabular-nums" style={{ width: widths.sell, minWidth: widths.sell }}>
                        <span className="text-xs font-semibold text-gray-700">
                          €{Number(item.target_sell_price || 0).toFixed(2)}
                        </span>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle" style={{ width: widths.margin, minWidth: widths.margin }}>
                        <span className="text-xs font-semibold text-emerald-600">
                          {Number(item.profit_margin || 0).toFixed(1)}%
                        </span>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle" style={{ width: widths.score, minWidth: widths.score }}>
                        <span className="text-xs font-semibold text-gray-700">
                          {Number(item.deal_score || 0).toFixed(0)}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-center align-middle tabular-nums" style={{ width: widths.age, minWidth: widths.age }}>
                        <span className="text-xs text-gray-500">{age}</span>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
