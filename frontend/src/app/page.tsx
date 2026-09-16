'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Package, Euro, RefreshCw, ShoppingCart, CheckCircle, ArrowRight, Box, LineChart as ChartIcon, Copy, Check, LogOut, SearchCode, Filter, ShieldCheck, ShieldAlert, Truck, ChevronRight, Activity, PieChart, Radar, Flame, Barcode, MapPin, AlertTriangle, Settings, ClipboardCheck, X, FileText, UploadCloud, XCircle, RotateCcw, CalendarClock } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CommandBar from '@/components/CommandBar';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { differenceInDays } from 'date-fns';

interface PriceHistory { price_amazon: number; recorded_at: string; }
interface GeneratedListing { generated_title: string; generated_description: string; }
interface ScoreBreakdown { discount: number; demand: number; competition: number; capital_efficiency: number; storage_size: number; risk_level: number; seasonality: number; }

// Phase 16: Events Interface
interface CalendarEvent { id: string; event_name: string; event_date: string; target_categories: string[]; }

interface Opportunity {
  id: string; buy_price: number; target_sell_price: number; profit_margin: number; ai_decision: string; status: string;
  buybox_seller: string; buybox_is_fba: boolean; deal_score?: number; holding_period_months?: number; seasonality_analysis?: string;
  sku?: string; emergency_sell_price?: number; warehouse_location?: string; product_condition?: string; days_in_inventory?: number;
  is_quarantine?: boolean; score_breakdown?: ScoreBreakdown; willhaben_realistic_price?: number; purchase_thesis?: string;
  invoice_url?: string; created_at: string; sold_at?: string; // Phase 15: sold_at added
  products: { title: string; asin: string; category: string; image_url: string | null; price_history: PriceHistory[]; };
  generated_listings: GeneratedListing[];
}

const TARGET_CATEGORIES = ['All Categories', 'Technology & Electronics', 'Home & Garden', 'Fashion & Clothing', 'Toys & Baby', 'Sports & Outdoors', 'Automotive', 'Books & Stationery'];

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]); // Phase 16 State
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'inventory' | 'sold' | 'rejected'>('pending');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDeal, setSelectedDeal] = useState<Opportunity | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  const [mainHorizontalKey, setMainHorizontalKey] = useState(0);
  const [leftVerticalKey, setLeftVerticalKey] = useState(0);
  const [centerVerticalKey, setCenterVerticalKey] = useState(0);
  const [rightVerticalKey, setRightVerticalKey] = useState(0);
  const resetMainHorizontal = () => setMainHorizontalKey(k => k + 1);
  const resetLeftVertical = () => setLeftVerticalKey(k => k + 1);
  const resetCenterVertical = () => setCenterVerticalKey(k => k + 1);
  const resetRightVertical = () => setRightVerticalKey(k => k + 1);

  const [inventoryModalDeal, setInventoryModalDeal] = useState<Opportunity | null>(null);
  const [checks, setChecks] = useState({ model: false, packaging: false, accessories: false, power: false });
  const allChecked = checks.model && checks.packaging && checks.accessories && checks.power;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login');
      else { setSession(session); fetchOpportunities(); fetchEvents(); }
    });
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/login');
      else setSession(session);
    });

    const channel = supabase
      .channel('opportunities_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'opportunities' }, (payload) => {
          fetchOpportunities(); 
      }).subscribe();

    return () => { authSub.unsubscribe(); supabase.removeChannel(channel); };
  }, [router]);

  const fetchOpportunities = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('opportunities').select(`
      id, buy_price, target_sell_price, profit_margin, ai_decision, status, buybox_seller, buybox_is_fba,
      deal_score, holding_period_months, seasonality_analysis,
      sku, emergency_sell_price, warehouse_location, product_condition, days_in_inventory, is_quarantine, score_breakdown, willhaben_realistic_price, purchase_thesis, invoice_url, created_at, sold_at,
      products ( title, asin, category, image_url, price_history ( price_amazon, recorded_at ) ),
      generated_listings ( generated_title, generated_description )
    `).order('created_at', { ascending: false });
    if (!error && data) {
      setOpportunities(data as any);
      if (data.length > 0 && !selectedDeal) setSelectedDeal(data[0] as any);
    }
    setLoading(false);
  };

  // Phase 16: Fetch Upcoming Events from DB
  const fetchEvents = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase.from('events_calendar').select('*').gte('event_date', today).order('event_date', { ascending: true });
    if (!error && data) setUpcomingEvents(data);
  };

  const updateStatus = async (id: string, newStatus: string, condition?: string, isQuarantine?: boolean, targetSellPrice?: number) => {
    try {
      const payload: any = { status: newStatus };
      if (condition) payload.product_condition = condition;
      if (isQuarantine !== undefined) payload.is_quarantine = isQuarantine;
      if (targetSellPrice !== undefined) payload.target_sell_price = targetSellPrice; // Phase 14: Adjust price

      const res = await fetch(`http://localhost:8000/api/v1/deals/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (res.ok) fetchOpportunities(); 
    } catch (error) { console.error(error); }
  };

  const handleInventorySubmit = (action: 'approve' | 'quarantine') => {
    if (!inventoryModalDeal) return;
    if (action === 'approve') updateStatus(inventoryModalDeal.id, 'in_inventory', 'NEW', false);
    else updateStatus(inventoryModalDeal.id, 'in_inventory', 'REVIEW NEEDED', true);
    setInventoryModalDeal(null);
    setChecks({ model: false, packaging: false, accessories: false, power: false });
  };

  const handleInvoiceUpload = async (event: React.ChangeEvent<HTMLInputElement>, dealId: string) => {
    try {
      if (!event.target.files || event.target.files.length === 0) return;
      setUploadingInvoice(true);
      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${dealId}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const { data, error } = await supabase.storage.from('invoices').upload(fileName, file);
      if (error) throw error;
      const { data: publicUrlData } = supabase.storage.from('invoices').getPublicUrl(fileName);
      await supabase.from('opportunities').update({ invoice_url: publicUrlData.publicUrl }).eq('id', dealId);
      alert('Invoice uploaded successfully!');
      fetchOpportunities();
    } catch (error: any) { alert('Error uploading invoice: ' + error.message); } finally { setUploadingInvoice(false); }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredDeals = opportunities.filter(opp => {
    const tabMatch = activeTab === 'pending' ? opp.status === 'pending' : activeTab === 'inventory' ? ['bought', 'in_inventory', 'listed'].includes(opp.status) : activeTab === 'rejected' ? opp.status === 'rejected' : opp.status === 'sold';
    return tabMatch && (selectedCategory === 'All' || opp.products?.category === selectedCategory);
  });

  const generateYearlyMockData = (currentPrice: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((month, i) => ({ month, price: Math.round(i === 11 ? currentPrice : currentPrice + (Math.random() * 50 + 20)) }));
  };

  if (!session) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  const soldDeals = opportunities.filter(o => o.status === 'sold');
  const inventoryDeals = opportunities.filter(o => ['bought', 'in_inventory', 'listed'].includes(o.status));
  const revenue = soldDeals.reduce((s, o) => s + Number(o.target_sell_price), 0);
  const grossProfit = soldDeals.reduce((s, o) => s + Number(o.target_sell_price) - Number(o.buy_price), 0);
  const inventoryValue = inventoryDeals.reduce((s, o) => s + Number(o.buy_price), 0);
  const totalInvestedSold = soldDeals.reduce((s, o) => s + Number(o.buy_price), 0);
  const averageRoi = totalInvestedSold > 0 ? (grossProfit / totalInvestedSold) * 100 : 0;
  
  // Phase 15: True Velocity Metrics (Average Days to Sell)
  const soldItemsWithDates = soldDeals.filter(d => d.sold_at && d.created_at);
  const totalDaysToSell = soldItemsWithDates.reduce((sum, d) => sum + differenceInDays(new Date(d.sold_at!), new Date(d.created_at)), 0);
  const averageDaysToSell = soldItemsWithDates.length > 0 ? Math.round(totalDaysToSell / soldItemsWithDates.length) : 0;

  const TAX_LIMIT = 55000;
  const taxLimitProgress = Math.min((revenue / TAX_LIMIT) * 100, 100);

  const ResizeHandle = ({ onDoubleClick }: { onDoubleClick?: () => void }) => (
    <Separator onDoubleClick={onDoubleClick} title="Double click to reset layout" className="relative flex w-2 items-center justify-center bg-gray-100 hover:bg-indigo-200 cursor-col-resize transition-colors group select-none">
      <div className="h-8 w-1 rounded-full bg-gray-300 group-hover:bg-indigo-400" /><span className="absolute text-[18px] leading-none text-white font-bold">⋮</span>
    </Separator>
  );

  const HorizontalResizeHandle = ({ onDoubleClick }: { onDoubleClick?: () => void }) => (
    <Separator onDoubleClick={onDoubleClick} title="Double click to reset layout" className="relative flex h-2 w-full items-center justify-center bg-gray-100 hover:bg-indigo-200 cursor-row-resize transition-colors group select-none">
      <div className="w-8 h-1 rounded-full bg-gray-300 group-hover:bg-indigo-400" /><span className="absolute text-[18px] leading-none text-white font-bold">⋯</span>
    </Separator>
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-white text-gray-900">
      <style jsx global>{`
        .vindera-left-panel { container-type: inline-size; }
        .vindera-left-panel .tab-long { display:none; }
        .vindera-left-panel .tab-short { display:inline; }
        @container (min-width:240px) { .vindera-left-panel .tab-short { display:none; } .vindera-left-panel .tab-long { display:inline; } }
      `}</style>

      <nav className="sticky top-0 z-50 h-14 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl shrink-0">
        <div className="flex h-full items-center justify-between px-5">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-sm"><Package className="h-5 w-5 text-white" /></div>
              <div className="leading-tight"><div className="text-[15px] font-bold tracking-tight text-gray-900">VINDERA</div><div className="text-[9px] font-medium tracking-[0.18em] text-gray-400">WORKSPACE</div></div>
            </div>
            <div className="hidden items-center gap-1 md:flex">
              <button onClick={() => router.push('/')} className="rounded-lg bg-indigo-50 px-3.5 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100">Workspace</button>
              <button onClick={() => router.push('/')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Opportunities</button>
              <button onClick={() => router.push('/')} className="rounded-lg px-3.5 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">Analytics</button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button title="Settings" className="p-2 text-gray-500 transition rounded-lg hover:bg-gray-100 hover:text-gray-900"><Settings className="h-4 w-4" /></button>
            <div className="h-4 w-px bg-gray-200 mx-1" />
            <button title="Sign out" onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} className="p-2 text-gray-500 transition rounded-lg hover:bg-gray-100 hover:text-red-600"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </nav>

      <div className="flex-1 overflow-hidden">
        <Group key={mainHorizontalKey} orientation="horizontal">
          
          {/* ======================================================================= */}
          {/* ========================== LEFT PANEL START ========================= */}
          {/* ======================================================================= */}
          <Panel defaultSize={25} minSize={15} maxSize={1100} collapsible={true} collapsedSize={0} className="bg-gray-50 flex flex-col border-r border-gray-200 vindera-left-panel transition-all">
            <Group key={leftVerticalKey} orientation="vertical">
              <Panel defaultSize={70} minSize={0} collapsible={true} className="flex flex-col">
                <div className="p-3 bg-gray-100 border-b border-gray-200 flex flex-col gap-2 shrink-0">
                  <div className="flex bg-gray-200 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('pending')} className={`flex-1 text-[10px] py-1.5 font-bold uppercase rounded-md transition-colors ${activeTab === 'pending' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><span className="tab-short">NEW</span><span className="tab-long">NEW DEALS</span></button>
                    <button onClick={() => setActiveTab('inventory')} className={`flex-1 text-[10px] py-1.5 font-bold uppercase rounded-md transition-colors ${activeTab === 'inventory' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><span className="tab-short">INV</span><span className="tab-long">INVENTORY</span></button>
                    <button onClick={() => setActiveTab('sold')} className={`flex-1 text-[10px] py-1.5 font-bold uppercase rounded-md transition-colors ${activeTab === 'sold' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>SOLD</button>
                    <button onClick={() => setActiveTab('rejected')} className={`flex-1 text-[10px] py-1.5 font-bold uppercase rounded-md transition-colors ${activeTab === 'rejected' ? 'bg-white shadow-sm text-red-600' : 'text-gray-500 hover:text-gray-700'}`}><span className="tab-short">REJ</span><span className="tab-long">REJECTED</span></button>
                  </div>
                  <div className="flex items-center gap-2 bg-white rounded-md px-2 py-1 border border-gray-200">
                    <Filter className="h-3 w-3 text-gray-400" />
                    <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="w-full text-xs bg-transparent border-none outline-none text-gray-600 cursor-pointer">
                      {TARGET_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                  {filteredDeals.length === 0 ? <p className="text-xs text-center text-gray-400 mt-4">No deals found.</p> : filteredDeals.map(opp => {
                    const ageInDays = opp.created_at ? differenceInDays(new Date(), new Date(opp.created_at)) : 0;
                    const isInventory = ['bought', 'in_inventory', 'listed'].includes(opp.status);
                    
                    return (
                    <button key={opp.id} onClick={() => setSelectedDeal(opp)} className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between group ${selectedDeal?.id === opp.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-transparent hover:border-gray-200 shadow-sm'}`}>
                      <div className="flex-1 min-w-0 pr-2">
                        <p className={`text-sm font-semibold truncate ${selectedDeal?.id === opp.id ? 'text-indigo-700' : 'text-gray-700'}`}>{opp.products?.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-[10px] text-gray-500">{opp.products?.asin}</p>
                          {isInventory && <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase ${ageInDays > 60 ? 'bg-red-100 text-red-700' : ageInDays > 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{ageInDays} Days</span>}
                        </div>
                      </div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${selectedDeal?.id === opp.id ? 'text-indigo-500' : 'text-gray-300 group-hover:text-gray-400'}`} />
                    </button>
                    );
                  })}
                </div>
              </Panel>

              <HorizontalResizeHandle onDoubleClick={resetLeftVertical} />

              <Panel defaultSize={30} minSize={35} maxSize={1000} collapsible={false} className="bg-white flex flex-col border-t border-gray-200">
                <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center text-xs text-gray-500 font-bold tracking-wider uppercase shrink-0">
                  <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-emerald-500" /> Financial & Tax Dashboard</div>
                </div>
                <div className="flex-1 p-4 flex flex-col gap-3 overflow-y-auto">
                  <div className="mb-2">
                    <div className="flex justify-between items-center text-[10px] text-gray-500 font-bold uppercase mb-1"><span>Umsatz (Revenue)</span><span>€{revenue.toFixed(2)} / €55k Limit</span></div>
                    <div className="w-full bg-gray-100 rounded-full h-2"><div className={`h-2 rounded-full ${taxLimitProgress > 80 ? 'bg-red-500' : taxLimitProgress > 50 ? 'bg-amber-400' : 'bg-indigo-500'}`} style={{ width: `${taxLimitProgress}%` }}></div></div>
                  </div>
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2"><span className="text-xs text-gray-500">Gross Profit</span><span className="text-sm font-bold text-green-600">+€{grossProfit.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2"><span className="text-xs text-gray-500">Average ROI</span><span className="text-sm font-bold text-indigo-600">{averageRoi.toFixed(1)}%</span></div>
                  {/* Phase 15: True Velocity Metrics */}
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <span className="text-xs text-gray-500">Avg. Days to Sell</span>
                    <span className={`text-sm font-bold ${averageDaysToSell > 60 ? 'text-red-600' : 'text-gray-900'}`}>{averageDaysToSell} Days</span>
                  </div>
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2"><span className="text-xs text-gray-500">Inventory Value</span><span className="text-sm font-bold text-gray-900">€{inventoryValue.toFixed(2)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-xs text-gray-500">Active SKUs</span><span className="text-sm font-bold text-gray-900">{inventoryDeals.length}</span></div>
                </div>
              </Panel>
            </Group>
          </Panel>
          {/* ========================== LEFT PANEL END ========================= */}


          <ResizeHandle onDoubleClick={resetMainHorizontal} />


          {/* ======================================================================= */}
          {/* ========================= CENTER PANEL START ======================== */}
          {/* ======================================================================= */}
          <Panel defaultSize={50} minSize={30} className="flex flex-col bg-white">
            <Group key={centerVerticalKey} orientation="vertical">
              <Panel defaultSize={80} className="flex-1 overflow-y-auto p-6 lg:p-10 relative">
                {!selectedDeal ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400"><SearchCode className="h-16 w-16 mb-4 text-gray-200" /><p>Select a deal from the explorer to view details.</p></div>
                ) : (
                  <div className="max-w-3xl mx-auto flex flex-col h-full">
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded">{selectedDeal.products?.category}</span>
                        <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded ${selectedDeal.status === 'rejected' ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>{selectedDeal.status.replace('_', ' ')}</span>
                      </div>
                      <h2 className="text-2xl font-extrabold text-gray-900">{selectedDeal.products?.title}</h2>
                      
                      <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-500 font-mono bg-gray-50 p-2 rounded-lg border border-gray-100 inline-flex">
                        <span className="flex items-center gap-1 font-bold text-gray-700"><Barcode className="h-4 w-4"/> {selectedDeal.sku || 'PENDING'}</span>
                        <span className="text-gray-300">|</span>
                        <span>ASIN: {selectedDeal.products?.asin}</span>
                        <span className="text-gray-300">|</span>
                        <span className="flex items-center gap-1"><MapPin className="h-4 w-4"/> LOC: {selectedDeal.warehouse_location || 'N/A'}</span>
                        <span className="text-gray-300">|</span>
                        <span className={`border px-2 py-0.5 rounded shadow-sm text-xs font-bold ${selectedDeal.product_condition === 'NEW' ? 'bg-white border-gray-200 text-gray-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>{selectedDeal.product_condition || 'NEW'}</span>
                        
                        <span className="text-gray-300">|</span>
                        {selectedDeal.invoice_url ? (
                          <a href={selectedDeal.invoice_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 px-2 py-0.5 rounded">
                            <FileText className="h-4 w-4"/> View Invoice
                          </a>
                        ) : (
                          <label className="flex items-center gap-1 text-gray-500 hover:text-indigo-600 font-bold cursor-pointer transition">
                            <UploadCloud className="h-4 w-4"/> {uploadingInvoice ? 'Uploading...' : 'Attach Invoice'}
                            <input type="file" accept=".pdf,image/*" className="hidden" disabled={uploadingInvoice} onChange={(e) => handleInvoiceUpload(e, selectedDeal.id)} />
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-8">
                      {selectedDeal.buybox_seller === 'Amazon' ? <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-md text-xs font-bold uppercase border border-emerald-200"><ShieldCheck className="h-4 w-4" /> Sold by Amazon</span> :
                      selectedDeal.buybox_is_fba ? <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-xs font-bold uppercase border border-blue-200"><Truck className="h-4 w-4" /> Prime (FBA) - {selectedDeal.buybox_seller}</span> :
                      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-3 py-1 rounded-md text-xs font-bold uppercase border border-red-200"><ShieldAlert className="h-4 w-4" /> High Risk (FBM) - {selectedDeal.buybox_seller}</span>}
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-bold uppercase ${selectedDeal.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}><Euro className="h-4 w-4" /> {selectedDeal.profit_margin}% AI Margin</span>
                    </div>

                    {selectedDeal.status === 'rejected' && (
                      <div className="bg-red-50 border border-red-200 p-5 rounded-xl mb-6 flex items-start gap-3">
                        <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-bold text-red-800">Deal Rejected by No-Buy Guardrails</h4>
                          <p className="text-xs text-red-700 mt-1 leading-relaxed">
                            This product failed the strict business logic rules (Must have {'>'}25% ROI and {'>'}€15 absolute profit). The system automatically rejected it to protect your capital.
                          </p>
                        </div>
                      </div>
                    )}

                    {['pending', 'rejected'].includes(selectedDeal.status) && (
                      <div className="bg-gray-50 border border-gray-200 p-5 rounded-xl mb-8 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">🧠 AI Product Acquisition Scorecard</h3>
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Score: {selectedDeal.deal_score || 0}/100</span>
                        </div>
                        
                        {selectedDeal.score_breakdown && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                            {Object.entries(selectedDeal.score_breakdown).map(([key, val]) => (
                              <div key={key} className="bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
                                <div className="text-[10px] text-gray-400 uppercase font-bold mb-1 truncate">{key.replace('_', ' ')}</div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                    <div className={`h-full ${Number(val) >= 8 ? 'bg-green-500' : Number(val) >= 5 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${(Number(val) / 10) * 100}%` }}></div>
                                  </div>
                                  <span className="text-xs font-bold text-gray-700">{String(val)}/10</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="text-sm text-gray-600 leading-relaxed border-l-2 border-indigo-500 pl-3">
                          <p className="mb-2"><strong>Reasoning:</strong> {selectedDeal.ai_decision}</p>
                          {selectedDeal.seasonality_analysis && <p><strong>Seasonality:</strong> {selectedDeal.seasonality_analysis}</p>}
                        </div>
                      </div>
                    )}

                    {(selectedDeal.purchase_thesis || selectedDeal.willhaben_realistic_price) && (
                      <div className="bg-amber-50 border border-amber-200 p-5 rounded-xl mb-6">
                        <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider mb-3 flex items-center gap-2">📝 Decision Journal</h3>
                        <p className="text-sm text-amber-900 italic leading-relaxed">"{selectedDeal.purchase_thesis || 'No thesis recorded.'}"</p>
                        <div className="mt-3 pt-3 border-t border-amber-200/50 flex items-center justify-between text-xs font-bold text-amber-700">
                          <span>Willhaben Realistic Market Price:</span><span className="text-sm">€{selectedDeal.willhaben_realistic_price || 'N/A'}</span>
                        </div>
                      </div>
                    )}

                    {['bought', 'in_inventory', 'listed'].includes(selectedDeal.status) && selectedDeal.created_at && differenceInDays(new Date(), new Date(selectedDeal.created_at)) > 60 && (
                      <div className="bg-red-50 border border-red-200 p-4 rounded-xl mb-6 flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-sm font-bold text-red-800">Dead Stock Alert! (Capital Locked)</h4>
                          <p className="text-xs text-red-700 mt-1 leading-relaxed">
                            This item has been tying up your capital for <strong>{differenceInDays(new Date(), new Date(selectedDeal.created_at))} days</strong>. 
                            Expert recommendation: Lower the price on Willhaben to the <strong className="bg-red-200 px-1 rounded">Emergency Price (€{selectedDeal.emergency_sell_price})</strong> to liquidate immediately and reinvest the capital.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="mt-auto">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Action Pipeline</h3>
                      <div className="flex flex-wrap gap-3">
                        {['pending', 'rejected'].includes(selectedDeal.status) && <><a href={`https://amazon.de/dp/${selectedDeal.products?.asin}`} target="_blank" rel="noreferrer" className="flex-1 bg-gray-900 text-white text-center py-3 rounded-xl text-sm font-medium hover:bg-gray-800 flex justify-center items-center gap-2"><ShoppingCart className="h-5 w-5" /> Buy on Amazon</a><button onClick={() => updateStatus(selectedDeal.id, 'bought')} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 flex justify-center items-center gap-2">Mark as Bought <ArrowRight className="h-5 w-5" /></button></>}
                        {selectedDeal.status === 'bought' && <button onClick={() => setInventoryModalDeal(selectedDeal)} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 flex justify-center items-center gap-2"><ClipboardCheck className="h-5 w-5" /> Receive & Check Quality</button>}
                        {selectedDeal.status === 'in_inventory' && !selectedDeal.is_quarantine && <button onClick={() => updateStatus(selectedDeal.id, 'listed')} className="flex-1 bg-purple-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-purple-700 flex justify-center items-center gap-2">Listed on Willhaben</button>}
                        {selectedDeal.status === 'in_inventory' && selectedDeal.is_quarantine && <div className="flex-1 bg-red-50 text-red-700 border border-red-200 py-3 rounded-xl text-sm font-bold flex justify-center items-center gap-2"><ShieldAlert className="h-5 w-5" /> In Quarantine (Review Needed)<button onClick={() => updateStatus(selectedDeal.id, 'in_inventory', 'OPEN BOX', false)} className="ml-2 underline text-xs hover:text-red-900">Resolve</button></div>}
                        {selectedDeal.status === 'listed' && <button onClick={() => updateStatus(selectedDeal.id, 'sold')} className="flex-1 bg-green-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-green-700 flex justify-center items-center gap-2"><CheckCircle className="h-5 w-5" /> Item Sold! (Claim Profit)</button>}
                        
                        {/* Phase 14: Customer Returned Workflow */}
                        {selectedDeal.status === 'sold' && (
                          <>
                            <div className="flex-1 bg-green-50 text-green-700 border border-green-200 py-3 rounded-xl text-sm font-bold flex justify-center items-center gap-2">
                              <CheckCircle className="h-5 w-5" /> Deal Successfully Closed
                            </div>
                            <button 
                              onClick={() => {
                                const newDegradedPrice = Number((selectedDeal.target_sell_price * 0.90).toFixed(2));
                                updateStatus(selectedDeal.id, 'in_inventory', 'OPEN BOX', true, newDegradedPrice);
                              }} 
                              className="flex-none px-4 bg-amber-100 text-amber-700 border border-amber-300 rounded-xl text-sm font-bold hover:bg-amber-200 flex justify-center items-center gap-2"
                              title="Customer Returned this item. Will put it back to quarantine and lower target price by 10%."
                            >
                              <RotateCcw className="h-5 w-5" /> Returned
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </Panel>

              <HorizontalResizeHandle onDoubleClick={resetCenterVertical} />
              <Panel defaultSize={35} minSize={35} className="bg-white flex flex-col border-t border-gray-200"><CommandBar /></Panel>
            </Group>
          </Panel>
          {/* ========================== CENTER PANEL END ========================= */}


          <ResizeHandle onDoubleClick={resetMainHorizontal} />


          {/* ======================================================================= */}
          {/* ========================== RIGHT PANEL START ======================== */}
          {/* ======================================================================= */}
          <Panel defaultSize={30} minSize={20} maxSize={1300} collapsible={true} collapsedSize={0} className="bg-gray-50 flex flex-col border-l border-gray-200 transition-all">
            <Group key={rightVerticalKey} orientation="vertical">
              <Panel defaultSize={104} minSize={30} className="p-6 overflow-y-auto">
                {!selectedDeal ? <div className="h-full flex flex-col items-center justify-center text-gray-400"><PieChart className="h-16 w-16 mb-4 text-gray-200" /><p>Analytics Output Window</p></div> :
                  <div className="flex flex-col gap-6">
                    <div>
                      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">3-Tier Price Strategy</h3>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-white border border-gray-200 p-3 rounded-xl shadow-sm"><p className="text-[9px] text-gray-400 font-bold uppercase mb-1">Max Buy</p><p className="text-lg font-bold text-gray-900">€{selectedDeal.buy_price}</p></div>
                        <div className="bg-indigo-600 p-3 rounded-xl shadow-sm text-white"><p className="text-[9px] text-indigo-200 font-bold uppercase mb-1">Target Sell</p><p className="text-lg font-bold">€{selectedDeal.target_sell_price}</p></div>
                        <div className="bg-red-50 border border-red-100 p-3 rounded-xl shadow-sm text-red-700"><p className="text-[9px] text-red-400 font-bold uppercase mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> Emergency</p><p className="text-lg font-bold">€{selectedDeal.emergency_sell_price || 'N/A'}</p></div>
                      </div>
                    </div>
                    <div><h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1"><ChartIcon className="h-4 w-4" /> 12-Month Trend</h3><div className="h-48 bg-white border border-gray-200 rounded-xl p-3 shadow-sm"><ResponsiveContainer width="100%" height="100%"><AreaChart data={generateYearlyMockData(selectedDeal.buy_price)}><defs><linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} /><stop offset="95%" stopColor="#4f46e5" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" /><XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} tickFormatter={val => `€${val}`} width={30} /><Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} /><Area type="monotone" dataKey="price" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" /></AreaChart></ResponsiveContainer></div></div>
                    {selectedDeal.generated_listings?.length > 0 && <div><h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Target Listing (Willhaben)</h3><div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative group"><p className="font-bold text-sm text-gray-900 mb-2 pr-6">{selectedDeal.generated_listings[0].generated_title}</p><button onClick={() => copyToClipboard(selectedDeal.generated_listings[0].generated_title, `${selectedDeal.id}-title`)} className="absolute top-3 right-3 text-gray-400 hover:text-indigo-600 bg-white">{copiedId === `${selectedDeal.id}-title` ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}</button><div className="border-t border-gray-100 mt-2 pt-2 relative"><p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed pr-6">{selectedDeal.generated_listings[0].generated_description}</p><button onClick={() => copyToClipboard(selectedDeal.generated_listings[0].generated_description, `${selectedDeal.id}-desc`)} className="absolute top-2 right-0 text-gray-400 hover:text-indigo-600 bg-white">{copiedId === `${selectedDeal.id}-desc` ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />} </button></div></div></div>}
                  </div>}
              </Panel>
              
              <HorizontalResizeHandle onDoubleClick={resetRightVertical} />
              
              <Panel defaultSize={45} minSize={35} className="bg-white flex flex-col">
                <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center text-xs text-gray-500 font-bold tracking-wider uppercase shrink-0">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-2"><Radar className="h-4 w-4 text-indigo-600" /> AI Smart Radar</span>
                    
                    {/* Phase 16: Dynamic Event Radar Header (Mini Upcoming) */}
                    {upcomingEvents.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                        <CalendarClock className="h-3 w-3" />
                        Next: {upcomingEvents[0].event_name} (T-{differenceInDays(new Date(upcomingEvents[0].event_date), new Date())})
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50/30">
                  {opportunities.filter(o => o.status === 'pending').sort((a, b) => (b.deal_score || 0) - (a.deal_score || 0)).length === 0 ? <div className="text-center text-xs text-gray-400 mt-4">No active deals on radar.</div> :
                    opportunities.filter(o => o.status === 'pending').sort((a, b) => (b.deal_score || 0) - (a.deal_score || 0)).map(opp => (
                      <div key={opp.id} className="bg-white border border-gray-200 p-3 rounded-lg shadow-sm hover:border-indigo-300 transition-colors cursor-pointer" onClick={() => setSelectedDeal(opp)}>
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-xs font-bold text-gray-800 truncate pr-2">{opp.products?.title}</p>
                          {opp.deal_score && opp.deal_score >= 80 ? <span className="flex items-center gap-1 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold border border-red-100 shrink-0"><Flame className="h-3 w-3" /> {opp.deal_score}%</span> :
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold border border-gray-200 shrink-0">{opp.deal_score || 0}%</span>}
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2"><div className={`h-1.5 rounded-full ${opp.deal_score && opp.deal_score >= 80 ? 'bg-red-500' : opp.deal_score && opp.deal_score >= 50 ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${opp.deal_score || 0}%` }}></div></div>
                        <div className="flex justify-between items-center text-[9px] text-gray-500 uppercase font-bold"><span>Hold: {opp.holding_period_months} Mo.</span><span>Margin: {opp.profit_margin}%</span></div>
                      </div>
                    ))}
                </div>
              </Panel>
            </Group>
          </Panel>
          {/* ========================== RIGHT PANEL END ======================== */}
        </Group>
      </div>

      {/* ========================================== */}
      {/* INVENTORY RECEIVING & QUARANTINE MODAL */}
      {/* ========================================== */}
      {inventoryModalDeal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="bg-gray-50 px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-indigo-600"/> Receiving Checklist</h3>
              <button onClick={() => { setInventoryModalDeal(null); setChecks({ model: false, packaging: false, accessories: false, power: false }); }} className="text-gray-400 hover:text-gray-700 transition"><X className="h-5 w-5"/></button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-sm text-gray-600 leading-relaxed">Before adding <strong>{inventoryModalDeal.products?.title}</strong> to active inventory, perform the mandatory physical checks.</p>
              <div className="flex flex-col gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                <label className="flex items-center gap-3 cursor-pointer group"><input type="checkbox" checked={checks.model} onChange={e => setChecks({...checks, model: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-gray-300" /><span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Verify Model & Serial Number match</span></label>
                <label className="flex items-center gap-3 cursor-pointer group"><input type="checkbox" checked={checks.packaging} onChange={e => setChecks({...checks, packaging: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-gray-300" /><span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Check for packaging damage / seals</span></label>
                <label className="flex items-center gap-3 cursor-pointer group"><input type="checkbox" checked={checks.accessories} onChange={e => setChecks({...checks, accessories: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-gray-300" /><span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Verify all accessories are included</span></label>
                <label className="flex items-center gap-3 cursor-pointer group"><input type="checkbox" checked={checks.power} onChange={e => setChecks({...checks, power: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-gray-300" /><span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">Power on / Functional test (if applicable)</span></label>
              </div>
              <div className="flex gap-3 mt-2">
                <button onClick={() => handleInventorySubmit('quarantine')} className="flex-1 py-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-bold hover:bg-red-100 transition">Fail (Quarantine)</button>
                <button disabled={!allChecked} onClick={() => handleInventorySubmit('approve')} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:bg-indigo-300 transition">Approve (Add)</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}