'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Package, Euro, RefreshCw, ShoppingCart, CheckCircle, ArrowRight, Box, LineChart as ChartIcon, Copy, Check, LogOut, SearchCode, Filter, ShieldCheck, ShieldAlert, Truck, ChevronRight, Activity, PieChart } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import CommandBar from '@/components/CommandBar';
import { Group, Panel, Separator } from 'react-resizable-panels';

interface PriceHistory { price_amazon: number; recorded_at: string; }
interface GeneratedListing { generated_title: string; generated_description: string; }
interface Opportunity {
  id: string; buy_price: number; target_sell_price: number; profit_margin: number; ai_decision: string; status: string;
  buybox_seller: string; buybox_is_fba: boolean;
  products: { title: string; asin: string; category: string; image_url: string | null; price_history: PriceHistory[]; };
  generated_listings: GeneratedListing[];
}

const TARGET_CATEGORIES = ['All', 'Technology & Electronics', 'Home & Garden', 'Fashion & Clothing', 'Toys & Baby', 'Sports & Outdoors', 'Automotive', 'Books & Stationery'];

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'inventory' | 'sold'>('pending');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDeal, setSelectedDeal] = useState<Opportunity | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push('/login');
      else { setSession(session); fetchOpportunities(); }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.push('/login');
      else setSession(session);
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const handleLogout = async () => await supabase.auth.signOut();

  const fetchOpportunities = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('opportunities').select(`
      id, buy_price, target_sell_price, profit_margin, ai_decision, status, buybox_seller, buybox_is_fba,
      products ( title, asin, category, image_url, price_history ( price_amazon, recorded_at ) ),
      generated_listings ( generated_title, generated_description )
    `).order('created_at', { ascending: false });
    if (!error && data) {
      setOpportunities(data as any);
      if (data.length > 0 && !selectedDeal) setSelectedDeal(data[0] as any);
    }
    setLoading(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/deals/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) fetchOpportunities();
    } catch (error) { console.error(error); }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredDeals = opportunities.filter(opp => {
    const tabMatch =
      activeTab === 'pending' ? opp.status === 'pending' :
      activeTab === 'inventory' ? ['bought', 'in_inventory', 'listed'].includes(opp.status) :
      opp.status === 'sold';
    return tabMatch && (selectedCategory === 'All' || opp.products?.category === selectedCategory);
  });

  const generateYearlyMockData = (currentPrice: number) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.map((month, i) => ({
      month, price: Math.round(i === 11 ? currentPrice : currentPrice + (Math.random() * 50 + 20))
    }));
  };

  if (!session) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  const totalInvested = opportunities.filter(o => ['bought', 'in_inventory', 'listed', 'sold'].includes(o.status)).reduce((s, o) => s + Number(o.buy_price), 0);
  const expectedProfit = opportunities.filter(o => ['bought', 'in_inventory', 'listed'].includes(o.status)).reduce((s, o) => s + Number(o.target_sell_price) - Number(o.buy_price), 0);
  const realizedProfit = opportunities.filter(o => o.status === 'sold').reduce((s, o) => s + Number(o.target_sell_price) - Number(o.buy_price), 0);

  const ResizeHandle = () => <Separator className="relative flex w-2 items-center justify-center bg-gray-100 hover:bg-indigo-200 cursor-col-resize transition-colors group"><div className="h-8 w-1 rounded-full bg-gray-300 group-hover:bg-indigo-400" /><span className="absolute text-[18px] leading-none text-white font-bold">⋮</span></Separator>;
  const HorizontalResizeHandle = () => <Separator className="relative flex h-2 w-full items-center justify-center bg-gray-100 hover:bg-indigo-200 cursor-row-resize transition-colors group"><div className="w-8 h-1 rounded-full bg-gray-300 group-hover:bg-indigo-400" /><span className="absolute text-[18px] leading-none text-white font-bold">⋯</span></Separator>;

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-white text-gray-900">
      <style jsx global>{`
        .vindera-left-panel { container-type: inline-size; }
        .vindera-left-panel .tab-long { display:none; }
        .vindera-left-panel .tab-short { display:inline; }
        @container (min-width:240px) {
          .vindera-left-panel .tab-short { display:none; }
          .vindera-left-panel .tab-long { display:inline; }
        }
      `}</style>

      {/* TOP NAVBAR */}
      <nav className="sticky top-0 z-50 h-16 border-b border-gray-200/70 bg-white/80 backdrop-blur-xl">
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
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg border border-gray-200/80 bg-gray-50/70 px-3 py-1.5 sm:flex"><Activity className="h-3.5 w-3.5 text-emerald-500" /><span className="text-xs font-medium text-gray-600">System Online</span></div>
            <div className="h-6 w-px bg-gray-200" />
            <button onClick={async () => { await supabase.auth.signOut(); router.push('/login'); }} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign out</span></button>
          </div>
        </div>
      </nav>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal">

          {/* LEFT PANEL */}
          <Panel defaultSize="20%" minSize="15%" maxSize="30%" className="bg-gray-50 flex flex-col border-r border-gray-200 vindera-left-panel">
            <Group orientation="vertical">

              <Panel defaultSize="70%" className="flex flex-col">
                <div className="p-3 bg-gray-100 border-b border-gray-200 flex flex-col gap-2 shrink-0">
                  <div className="flex bg-gray-200 p-1 rounded-lg">
                    <button onClick={() => setActiveTab('pending')} className={`flex-1 text-[10px] py-1.5 font-bold uppercase rounded-md transition-colors ${activeTab === 'pending' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><span className="tab-short">NEW</span><span className="tab-long">NEW DEALS</span></button>
                    <button onClick={() => setActiveTab('inventory')} className={`flex-1 text-[10px] py-1.5 font-bold uppercase rounded-md transition-colors ${activeTab === 'inventory' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><span className="tab-short">INV</span><span className="tab-long">INVENTORY</span></button>
                    <button onClick={() => setActiveTab('sold')} className={`flex-1 text-[10px] py-1.5 font-bold uppercase rounded-md transition-colors ${activeTab === 'sold' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>SOLD</button>
                  </div>
                  <div className="flex items-center gap-2 bg-white rounded-md px-2 py-1 border border-gray-200">
                    <Filter className="h-3 w-3 text-gray-400" />
                    <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)} className="w-full text-xs bg-transparent border-none outline-none text-gray-600 cursor-pointer">{TARGET_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                  {filteredDeals.length === 0 ? <p className="text-xs text-center text-gray-400 mt-4">No deals found.</p> : filteredDeals.map(opp => (
                    <button key={opp.id} onClick={() => setSelectedDeal(opp)} className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between group ${selectedDeal?.id === opp.id ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-transparent hover:border-gray-200 shadow-sm'}`}>
                      <div className="flex-1 min-w-0 pr-2"><p className={`text-sm font-semibold truncate ${selectedDeal?.id === opp.id ? 'text-indigo-700' : 'text-gray-700'}`}>{opp.products?.title}</p><p className="text-[10px] text-gray-500 mt-0.5">{opp.products?.asin}</p></div>
                      <ChevronRight className={`h-4 w-4 shrink-0 ${selectedDeal?.id === opp.id ? 'text-indigo-500' : 'text-gray-300 group-hover:text-gray-400'}`} />
                    </button>
                  ))}
                </div>
              </Panel>

              <HorizontalResizeHandle />

              <Panel defaultSize="30%" className="bg-white p-4 flex flex-col gap-3">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Activity className="h-3 w-3" /> Financial Overview</h3>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2"><span className="text-xs text-gray-500">Total Invested</span><span className="text-sm font-bold text-gray-900">€{totalInvested.toFixed(2)}</span></div>
                <div className="flex justify-between items-center border-b border-gray-100 pb-2"><span className="text-xs text-gray-500">Expected Profit</span><span className="text-sm font-bold text-indigo-600">€{expectedProfit.toFixed(2)}</span></div>
                <div className="flex justify-between items-center"><span className="text-xs text-gray-500">Realized Net</span><span className="text-sm font-bold text-green-600">€{realizedProfit.toFixed(2)}</span></div>
              </Panel>
            </Group>
          </Panel>

          <ResizeHandle />

          {/* CENTER PANEL */}
          <Panel defaultSize="50%" minSize="30%" className="flex flex-col bg-white">
            <Group orientation="vertical">
              <Panel defaultSize="65%" className="flex-1 overflow-y-auto p-6 lg:p-10 relative">
                {!selectedDeal ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400"><SearchCode className="h-16 w-16 mb-4 text-gray-200" /><p>Select a deal from the explorer to view details.</p></div>
                ) : (
                  <div className="max-w-3xl mx-auto flex flex-col h-full">
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-2"><span className="px-2 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded">{selectedDeal.products?.category}</span><span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase rounded">{selectedDeal.status.replace('_', ' ')}</span></div>
                      <h2 className="text-2xl font-extrabold text-gray-900">{selectedDeal.products?.title}</h2>
                      <p className="text-sm text-gray-500 mt-1 font-mono">ASIN: {selectedDeal.products?.asin}</p>
                    </div>

                    <div className="flex items-center gap-2 mb-8">
                      {selectedDeal.buybox_seller === 'Amazon' ? <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-md text-xs font-bold uppercase border border-emerald-200"><ShieldCheck className="h-4 w-4" /> Sold by Amazon</span> :
                      selectedDeal.buybox_is_fba ? <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-3 py-1 rounded-md text-xs font-bold uppercase border border-blue-200"><Truck className="h-4 w-4" /> Prime (FBA) - {selectedDeal.buybox_seller}</span> :
                      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 px-3 py-1 rounded-md text-xs font-bold uppercase border border-red-200"><ShieldAlert className="h-4 w-4" /> High Risk (FBM) - {selectedDeal.buybox_seller}</span>}
                      <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-md text-xs font-bold uppercase"><Euro className="h-4 w-4" /> {selectedDeal.profit_margin}% AI Margin</span>
                    </div>

                    {activeTab === 'pending' && <div className="bg-gray-50 border border-gray-200 p-5 rounded-xl mb-8"><h3 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-2">🧠 AI Risk & Profit Assessment</h3><p className="text-sm text-gray-600 leading-relaxed">"{selectedDeal.ai_decision}"</p></div>}

                    <div className="mt-auto">
                      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Action Pipeline</h3>
                      <div className="flex flex-wrap gap-3">
                        {selectedDeal.status === 'pending' && <><a href={`https://amazon.de/dp/${selectedDeal.products?.asin}`} target="_blank" rel="noreferrer" className="flex-1 bg-gray-900 text-white text-center py-3 rounded-xl text-sm font-medium hover:bg-gray-800 flex justify-center items-center gap-2"><ShoppingCart className="h-5 w-5" /> Buy on Amazon</a><button onClick={() => updateStatus(selectedDeal.id, 'bought')} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 flex justify-center items-center gap-2">Mark as Bought <ArrowRight className="h-5 w-5" /></button></>}
                        {selectedDeal.status === 'bought' && <button onClick={() => updateStatus(selectedDeal.id, 'in_inventory')} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-indigo-700 flex justify-center items-center gap-2"><Box className="h-5 w-5" /> Arrived (Add to Inventory)</button>}
                        {selectedDeal.status === 'in_inventory' && <button onClick={() => updateStatus(selectedDeal.id, 'listed')} className="flex-1 bg-purple-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-purple-700 flex justify-center items-center gap-2">Listed on Willhaben</button>}
                        {selectedDeal.status === 'listed' && <button onClick={() => updateStatus(selectedDeal.id, 'sold')} className="flex-1 bg-green-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-green-700 flex justify-center items-center gap-2"><CheckCircle className="h-5 w-5" /> Item Sold! (Claim Profit)</button>}
                        {selectedDeal.status === 'sold' && <div className="flex-1 bg-green-50 text-green-700 border border-green-200 py-3 rounded-xl text-sm font-bold flex justify-center items-center gap-2"><CheckCircle className="h-5 w-5" /> Deal Successfully Closed</div>}
                      </div>
                    </div>
                  </div>
                )}
              </Panel>

              <HorizontalResizeHandle />
              <Panel defaultSize="35%" minSize="20%" className="bg-white flex flex-col border-t border-gray-200"><CommandBar /></Panel>
            </Group>
          </Panel>

          <ResizeHandle />

          {/* RIGHT PANEL */}
          <Panel defaultSize="30%" minSize="20%" className="bg-gray-50 flex flex-col border-l border-gray-200">
            <Group orientation="vertical">
              <Panel defaultSize="70%" minSize="30%" className="p-6 overflow-y-auto">
                {!selectedDeal ? <div className="h-full flex flex-col items-center justify-center text-gray-400"><PieChart className="h-16 w-16 mb-4 text-gray-200" /><p>Analytics Output Window</p></div> :
                  <div className="flex flex-col gap-6">
                    <div><h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Price Strategy</h3><div className="grid grid-cols-2 gap-3"><div className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm"><p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Buy Price</p><p className="text-xl font-bold text-gray-900">€{selectedDeal.buy_price}</p></div><div className="bg-indigo-600 p-4 rounded-xl shadow-sm text-white"><p className="text-[10px] text-indigo-200 font-bold uppercase mb-1">Target Sell</p><p className="text-xl font-bold">€{selectedDeal.target_sell_price}</p></div></div></div>
                    <div><h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1"><ChartIcon className="h-4 w-4" /> 12-Month Trend</h3><div className="h-48 bg-white border border-gray-200 rounded-xl p-3 shadow-sm"><ResponsiveContainer width="100%" height="100%"><AreaChart data={generateYearlyMockData(selectedDeal.buy_price)}><defs><linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3} /><stop offset="95%" stopColor="#4f46e5" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" /><XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} /><YAxis tick={{ fontSize: 10, fill: '#6B7280' }} tickLine={false} axisLine={false} tickFormatter={val => `€${val}`} width={30} /><Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} /><Area type="monotone" dataKey="price" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorPrice)" /></AreaChart></ResponsiveContainer></div></div>
                    {selectedDeal.generated_listings?.length > 0 && <div><h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Target Listing (Willhaben)</h3><div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative group"><p className="font-bold text-sm text-gray-900 mb-2 pr-6">{selectedDeal.generated_listings[0].generated_title}</p><button onClick={() => copyToClipboard(selectedDeal.generated_listings[0].generated_title, `${selectedDeal.id}-title`)} className="absolute top-3 right-3 text-gray-400 hover:text-indigo-600 bg-white">{copiedId === `${selectedDeal.id}-title` ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}</button><div className="border-t border-gray-100 mt-2 pt-2 relative"><p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed pr-6">{selectedDeal.generated_listings[0].generated_description}</p><button onClick={() => copyToClipboard(selectedDeal.generated_listings[0].generated_description, `${selectedDeal.id}-desc`)} className="absolute top-2 right-0 text-gray-400 hover:text-indigo-600 bg-white">{copiedId === `${selectedDeal.id}-desc` ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}</button></div></div></div>}
                  </div>}
              </Panel>

              <HorizontalResizeHandle />

              <Panel defaultSize="30%" minSize="0%" className="bg-white">
              </Panel>
            </Group>
          </Panel>

        </Group>
      </div>
    </div>
  );
}