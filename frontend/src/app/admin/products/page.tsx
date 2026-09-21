'use client';

/** Product Master — searchable table with drag-resizable columns and CSV export. */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { checkIsAdmin } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Package, LogOut, RefreshCw, Search, ArrowUpDown, Download, Filter, Sun, Moon } from 'lucide-react';
import { useDarkMode } from '@/lib/useDarkMode';
import { STATUS_OPTIONS } from '@/lib/constants';
import { fetchAllRows } from '@/lib/fetchAll';
import { effectiveCost, holdingDays, returnByBadge } from '@/lib/lifecycle';
import { errorMessage } from '@/lib/apiFetch';

interface Opportunity {
  id: string;
  sku: string;
  status: string;
  buy_price: number;
  target_sell_price: number;
  profit_margin: number;
  net_profit_estimate: number | null;
  net_margin_estimate: number | null;
  purchase_price_actual: number | null;
  inbound_shipping_cost: number | null;
  packaging_cost: number | null;
  purchased_at: string | null;
  received_at: string | null;
  return_by: string | null;
  deal_score: number;
  created_at: string;
  products: { title: string; asin: string; category: string };
}

/** Rows per page of the table (all rows are loaded, only this many are drawn). */
const PAGE_SIZE = 100;

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

function ResizeHandle({ column, resizing, onResizeStart }: {
  column: Column;
  resizing: Column | null;
  onResizeStart: (column: Column, e: React.PointerEvent) => void;
}) {
  return (
    <span
      onPointerDown={e => onResizeStart(column, e)}
      className="absolute right-0 top-0 z-30 flex h-full w-4 translate-x-1/2 cursor-col-resize items-center justify-center touch-none select-none"
    >
      <span className={`h-7 w-px rounded-full transition-all duration-150 ${
        resizing === column
          ? 'w-[2px] bg-indigo-600'
          : 'bg-gray-300 opacity-70 group-hover:bg-indigo-400 group-hover:opacity-100'
      }`} />
    </span>
  );
}

interface HeaderProps {
  column: Column;
  widths: Record<Column, number>;
  resizing: Column | null;
  onResizeStart: (column: Column, e: React.PointerEvent) => void;
  children: React.ReactNode;
  last?: boolean;
}

function Header({ column, widths, resizing, onResizeStart, children, last = false }: HeaderProps) {
  return (
    <th
      className="group relative h-12 border-b border-r border-gray-200 bg-gray-50/95 px-4 text-center align-middle"
      style={{ width: widths[column], minWidth: widths[column], maxWidth: widths[column] }}
    >
      <div className="flex h-full items-center justify-center gap-1.5 whitespace-nowrap type-label text-gray-500">
        {children}
      </div>
      {!last && <ResizeHandle column={column} resizing={resizing} onResizeStart={onResizeStart} />}
    </th>
  );
}

export default function ProductMaster() {
  const router = useRouter();
  const { dark, toggle: toggleDark } = useDarkMode();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [widths, setWidths] = useState(initialWidths);
  const [resizing, setResizing] = useState<Column | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  /** Every live (not soft-deleted) deal, read in pages so nothing is cut off at 1000 rows. */
  const fetchOpportunities = async () => {
    setLoading(true);
    try {
      const rows = await fetchAllRows<Opportunity>((from, to) => supabase
        .from('opportunities')
        .select(`
          id, sku, status, buy_price, target_sell_price, profit_margin, net_profit_estimate, net_margin_estimate,
          purchase_price_actual, inbound_shipping_cost, packaging_cost, purchased_at, received_at, return_by,
          deal_score, created_at, products (title, asin, category)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to) as unknown as PromiseLike<{ data: Opportunity[] | null; error: { message: string } | null }>);
      setOpportunities(rows);
      setLoadError(null);
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load the products.'));
    }
    setLoading(false);
  };

  useEffect(() => {
    // Protected route: admin-only, enforced again by RLS on every read.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/admin/login'); return; }
      if (!(await checkIsAdmin())) { router.push('/'); return; }
      fetchOpportunities();
    });
  }, [router]);

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
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    const search = searchTerm.toLowerCase();
    return (
      item.products?.title?.toLowerCase().includes(search) ||
      item.sku?.toLowerCase().includes(search) ||
      item.products?.asin?.toLowerCase().includes(search)
    );
  });

  const pageCount = Math.max(1, Math.ceil(filteredOpportunities.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleOpportunities = filteredOpportunities.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'bought': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'in_inventory': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'listed': return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'sold': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'rejected': return 'bg-red-50 text-red-700 border-red-200';
      case 'cancelled': return 'bg-slate-50 text-slate-600 border-slate-200';
      case 'written_off': return 'bg-orange-50 text-orange-700 border-orange-200';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  const exportCSV = () => {
    const headers = [
      'SKU', 'Product', 'ASIN', 'Category', 'Status', 'Planned Buy Price', 'Price Paid', 'Inbound Shipping', 'Packaging',
      'Effective Cost', 'Target Sell', 'Net Profit Estimate', 'Net Margin %', 'AI Score', 'Purchased', 'Return By', 'Age (Days)',
    ];
    const rows = filteredOpportunities.map(item => [
      item.sku, item.products?.title, item.products?.asin, item.products?.category,
      item.status, item.buy_price, item.purchase_price_actual, item.inbound_shipping_cost, item.packaging_cost,
      effectiveCost(item).toFixed(2), item.target_sell_price, item.net_profit_estimate, item.net_margin_estimate ?? item.profit_margin,
      item.deal_score, item.purchased_at?.slice(0, 10), item.return_by, holdingDays(item),
    ]);

    // A cell starting with = + - @ would be run as a formula by a spreadsheet: neutralise it.
    const cell = (value: unknown) => {
      const text = String(value ?? '');
      const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const csv = [headers.join(','), ...rows.map(row => row.map(cell).join(','))].join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'product-master.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const headerProps = { widths, resizing, onResizeStart: startResize };

  return (
    <div className="vindera-admin flex min-h-screen flex-col bg-[#f7f8fa] text-gray-900">

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
              <button onClick={() => router.push('/admin')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
                Workspace
              </button>
              <button onClick={() => router.push('/admin/products')} className="rounded-lg bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">
                Product Master
              </button>
              <button onClick={() => router.push('/admin/manual-entry')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
                Manual Entry
              </button>
              <button onClick={() => router.push('/admin/reports')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
                Tax & Reports
              </button>
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

      <main className="flex-1 overflow-auto p-6">
        {loadError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {loadError}
            <button onClick={fetchOpportunities} className="ml-3 font-semibold underline">Retry</button>
          </div>
        )}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="type-page-title text-gray-900">Products</h1>
            <p className="mt-1 text-[13px] text-gray-400 tabular-nums">{filteredOpportunities.length} records</p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
                placeholder="Search SKU, ASIN or product..."
                className="h-9 w-72 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-[13px] text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
              aria-label="Filter by status"
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50"
            >
              <option value="all">All statuses</option>
              {STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label.split(' — ')[0]}</option>
              ))}
            </select>

            <button
              onClick={fetchOpportunities}
              className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>

            <button
              onClick={exportCSV}
              className="flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50"
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
                <Header {...headerProps} column="sku">SKU <ArrowUpDown className="h-3 w-3 text-gray-400" /></Header>
                <Header {...headerProps} column="product">Product Details</Header>
                <Header {...headerProps} column="status">Status <Filter className="h-3 w-3 text-gray-400" /></Header>
                <Header {...headerProps} column="buy">Cost</Header>
                <Header {...headerProps} column="sell">Target Sell</Header>
                <Header {...headerProps} column="margin">Net Profit / Margin</Header>
                <Header {...headerProps} column="score">AI Score</Header>
                <Header {...headerProps} column="age" last>Age (Days)</Header>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="h-40 text-center text-[13px] text-gray-400">
                    Loading products...
                  </td>
                </tr>
              ) : filteredOpportunities.length === 0 ? (
                <tr>
                  <td colSpan={8} className="h-40 text-center text-[13px] text-gray-400">
                    No products found.
                  </td>
                </tr>
              ) : (
                visibleOpportunities.map(item => {
                  const age = holdingDays(item);
                  const returnBadge = returnByBadge(item);
                  const cost = effectiveCost(item);
                  const netProfit = item.net_profit_estimate;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => router.push(`/admin/manual-entry?id=${item.id}`)}
                      title="Open this deal in the editor"
                      className="group cursor-pointer transition-colors hover:bg-gray-50/80"
                    >

                      <td className="border-r border-gray-100 px-4 py-4 align-middle" style={{ width: widths.sku, minWidth: widths.sku }}>
                        <span className="block truncate font-mono text-[12px] font-medium text-gray-600">
                          {item.sku || '—'}
                        </span>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 align-middle" style={{ width: widths.product, minWidth: widths.product }}>
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-gray-800">
                            {item.products?.title || 'Unknown Product'}
                          </div>
                          <div className="mt-1 truncate font-mono text-[11px] text-gray-400">
                            {item.products?.asin || '—'}
                            {item.products?.category ? ` · ${item.products.category}` : ''}
                          </div>
                        </div>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle" style={{ width: widths.status, minWidth: widths.status }}>
                        <span className={`inline-flex rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] ${getStatusStyle(item.status)}`}>
                          {item.status?.replace('_', ' ')}
                        </span>
                        {returnBadge && (
                          <div title="Amazon return deadline" className={`mt-1 text-[9px] font-semibold uppercase tracking-[0.06em] ${returnBadge.tone === 'red' ? 'text-red-600' : 'text-amber-700'}`}>{returnBadge.label}</div>
                        )}
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle tabular-nums" style={{ width: widths.buy, minWidth: widths.buy }}>
                        <span className="text-[13px] font-semibold text-gray-700">
                          €{cost.toFixed(2)}
                        </span>
                        {item.purchase_price_actual != null && Number(item.purchase_price_actual) !== Number(item.buy_price) && (
                          <div className="text-[10px] text-gray-400" title="Planned buy price at scan time">planned €{Number(item.buy_price).toFixed(2)}</div>
                        )}
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle tabular-nums" style={{ width: widths.sell, minWidth: widths.sell }}>
                        <span className="text-[13px] font-semibold text-gray-700">
                          €{Number(item.target_sell_price || 0).toFixed(2)}
                        </span>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle" style={{ width: widths.margin, minWidth: widths.margin }}>
                        <span className={`text-[13px] font-semibold tabular-nums ${Number(netProfit ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {netProfit == null ? '—' : `€${Number(netProfit).toFixed(2)}`}
                        </span>
                        <div className="text-[11px] tabular-nums text-gray-400">{Number(item.net_margin_estimate ?? item.profit_margin ?? 0).toFixed(1)}%</div>
                      </td>

                      <td className="border-r border-gray-100 px-4 py-4 text-center align-middle" style={{ width: widths.score, minWidth: widths.score }}>
                        <span className="text-[13px] font-semibold tabular-nums text-gray-700">
                          {Number(item.deal_score || 0).toFixed(0)}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-center align-middle tabular-nums" style={{ width: widths.age, minWidth: widths.age }}>
                        <span className="text-[13px] text-gray-500">{age}</span>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="mt-3 flex items-center justify-between text-[13px] text-gray-500">
            <span className="tabular-nums">Page {currentPage + 1} of {pageCount}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} className="h-8 rounded-lg border border-gray-200 bg-white px-3 font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40">Previous</button>
              <button onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} className="h-8 rounded-lg border border-gray-200 bg-white px-3 font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
