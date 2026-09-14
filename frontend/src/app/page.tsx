'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Package, TrendingDown, Euro, RefreshCw, ShoppingCart, Search, Zap, CheckCircle, ArrowRight, Box, LineChart as ChartIcon, Copy, Check, Settings as SettingsIcon, Save, Wallet, TrendingUp, PiggyBank, LogOut, SearchCode, X, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format, parseISO } from 'date-fns';
import CommandBar from '@/components/CommandBar';

interface PriceHistory { price_amazon: number; recorded_at: string; }
interface GeneratedListing { generated_title: string; generated_description: string; }
interface Opportunity {
  id: string; buy_price: number; target_sell_price: number; profit_margin: number; ai_decision: string; status: string;
  products: { title: string; asin: string; category: string; image_url: string | null; price_history: PriceHistory[]; };
  generated_listings: GeneratedListing[];
}

// "General" is completely removed. "All" represents viewing everything.
const TARGET_CATEGORIES = [
  'All',
  'Technology & Electronics',
  'Home & Garden',
  'Fashion & Clothing',
  'Toys & Baby',
  'Sports & Outdoors',
  'Automotive',
  'Books & Stationery'
];

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [scanAsin, setScanAsin] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'pending' | 'inventory' | 'sold' | 'settings'>('pending');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  const [settings, setSettings] = useState({ minMargin: 30, maxBudget: 500, autoBuy: false });
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
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
        id, buy_price, target_sell_price, profit_margin, ai_decision, status,
        products ( title, asin, category, image_url, price_history ( price_amazon, recorded_at ) ),
        generated_listings ( generated_title, generated_description )
      `).order('created_at', { ascending: false });

    if (!error && data) {
      setOpportunities(data as any);
    }
    setLoading(false);
  };

  const handleManualScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanAsin.trim()) return;
    setIsScanning(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/deals/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asin: scanAsin.trim() }) });
      if (res.ok) { setScanAsin(''); setTimeout(() => fetchOpportunities(), 5000); }
    } catch (error) { console.error(error); }
    setIsScanning(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/deals/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
      if (res.ok) fetchOpportunities();
    } catch (error) { console.error(error); }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleCard = (id: string) => {
    setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredDeals = opportunities.filter((opp) => {
    if (activeTab === 'settings') return false;
    let tabMatch = false;
    if (activeTab === 'pending') tabMatch = opp.status === 'pending';
    if (activeTab === 'inventory') tabMatch = ['bought', 'in_inventory', 'listed'].includes(opp.status);
    if (activeTab === 'sold') tabMatch = opp.status === 'sold';
    
    // Ignore "General" logic if it comes from old DB data, treat it as All/Technology for UI matching
    let catMatch = selectedCategory === 'All' || opp.products?.category === selectedCategory;
    return tabMatch && catMatch;
  });

  const formatChartData = (history: PriceHistory[]) => {
    if (!history) return [];
    return history.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()).map(item => ({ date: format(parseISO(item.recorded_at), 'MMM dd'), price: item.price_amazon }));
  };

  const generateYearlyMockData = (currentPrice: number) => {
    const data = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for(let i=0; i<12; i++) {
      const randomPrice = i === 11 ? currentPrice : currentPrice + (Math.random() * 50 + 20);
      data.push({ month: months[i], price: Math.round(randomPrice) });
    }
    return data;
  };

  if (!session) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><RefreshCw className="h-8 w-8 animate-spin text-indigo-600" /></div>;

  const activeDealsCount = opportunities.filter(o => o.status === 'pending').length;
  const totalInvested = opportunities.filter(o => ['bought', 'in_inventory', 'listed', 'sold'].includes(o.status)).reduce((sum, o) => sum + Number(o.buy_price), 0);
  const expectedProfit = opportunities.filter(o => ['bought', 'in_inventory', 'listed'].includes(o.status)).reduce((sum, o) => sum + (Number(o.target_sell_price) - Number(o.buy_price)), 0);
  const realizedProfit = opportunities.filter(o => o.status === 'sold').reduce((sum, o) => sum + (Number(o.target_sell_price) - Number(o.buy_price)), 0);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 pb-32">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-indigo-600 flex items-center gap-2"><Package className="h-8 w-8" /> Vindera Arbitrage</h1>
            <p className="text-gray-500 mt-1">Austrian Deal Hunter Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchOpportunities} className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
            <button onClick={handleLogout} className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-lg shadow-sm hover:bg-red-100"><LogOut className="h-4 w-4" /> Sign Out</button>
          </div>
        </div>

        {/* FINANCIAL METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg"><TrendingDown className="h-6 w-6" /></div>
            <div><p className="text-sm text-gray-500 font-medium">New Deals</p><p className="text-2xl font-bold">{activeDealsCount}</p></div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-orange-100 text-orange-600 rounded-lg"><Wallet className="h-6 w-6" /></div>
            <div><p className="text-sm text-gray-500 font-medium">Invested</p><p className="text-2xl font-bold">€{totalInvested.toFixed(2)}</p></div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg"><TrendingUp className="h-6 w-6" /></div>
            <div><p className="text-sm text-gray-500 font-medium">Expected Profit</p><p className="text-2xl font-bold">€{expectedProfit.toFixed(2)}</p></div>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg"><PiggyBank className="h-6 w-6" /></div>
            <div><p className="text-sm text-gray-500 font-medium">Realized Net</p><p className="text-2xl font-bold text-green-600">€{realizedProfit.toFixed(2)}</p></div>
          </div>
        </div>

        {/* MANUAL SEARCH BAR */}
        {activeTab !== 'settings' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Search className="h-5 w-5 text-indigo-500"/> Manual Deal Scanner</h2>
            <form onSubmit={handleManualScan} className="flex gap-3">
              <input type="text" value={scanAsin} onChange={(e) => setScanAsin(e.target.value)} placeholder="Paste Amazon ASIN here (e.g. B09JQZ5DYM)" className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
              <button type="submit" disabled={isScanning} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2 disabled:bg-indigo-300"><Zap className="h-4 w-4" />{isScanning ? 'Scanning...' : 'Analyze Deal'}</button>
            </form>
          </div>
        )}

        {/* Filters and Tabs Row */}
        <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-gray-200 mb-6 gap-4">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
            <button onClick={() => setActiveTab('pending')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'pending' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>🔥 New Deals</button>
            <button onClick={() => setActiveTab('inventory')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'inventory' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📦 Inventory</button>
            <button onClick={() => setActiveTab('sold')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'sold' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>💰 Sold</button>
            <button onClick={() => setActiveTab('settings')} className={`flex-1 sm:flex-none px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'settings' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'} flex items-center justify-center gap-2`}><SettingsIcon className="h-4 w-4"/> Settings</button>
          </div>

          {activeTab !== 'settings' && (
            <div className="w-full sm:w-auto px-2">
              <div className="relative flex items-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors px-3 py-2 rounded-lg cursor-pointer">
                <Filter className="h-4 w-4 text-gray-500 shrink-0" />
                <select 
                  value={selectedCategory} 
                  onChange={(e) => setSelectedCategory(e.target.value)} 
                  className="bg-transparent border-none text-sm font-bold text-indigo-600 focus:ring-0 cursor-pointer outline-none appearance-none pr-6 w-full sm:w-auto text-right"
                  style={{ textAlignLast: 'right' }}
                >
                  {TARGET_CATEGORIES.map(cat => <option key={cat} value={cat} className="text-gray-900">{cat}</option>)}
                </select>
                <ChevronDown className="absolute right-3 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        {/* SETTINGS PANEL */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-2xl mb-8 animate-in fade-in">
            <h2 className="text-2xl font-bold mb-6 border-b pb-4">System Configurations</h2>
            <div className="space-y-6">
              <div><label className="block text-sm font-medium mb-2">Minimum AI Profit Margin (%)</label><input type="number" value={settings.minMargin} onChange={e => setSettings({...settings, minMargin: Number(e.target.value)})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2" /></div>
              <div><label className="block text-sm font-medium mb-2">Maximum Deal Budget (€)</label><input type="number" value={settings.maxBudget} onChange={e => setSettings({...settings, maxBudget: Number(e.target.value)})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2" /></div>
              <button className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 flex items-center justify-center gap-2 mt-4"><Save className="h-5 w-5" /> Save Configuration</button>
            </div>
          </div>
        )}

        {/* DEALS LIST */}
        {activeTab !== 'settings' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            {loading ? (<p className="text-gray-500">Loading data from database...</p>) : filteredDeals.length === 0 ? (<p className="text-gray-500">No items found in this category.</p>) : (
              filteredDeals.map((opp) => {
                const isExpanded = expandedCards[opp.id] || false;
                return (
                  <div 
                    key={opp.id} 
                    className={`bg-white rounded-xl shadow-sm border ${isExpanded ? 'border-indigo-200 ring-1 ring-indigo-50 xl:col-span-2' : 'border-gray-200 hover:border-indigo-300'} transition-all overflow-hidden flex flex-col h-fit`}
                  >
                    
                    {/* ACCORDION HEADER */}
                    <div onClick={() => toggleCard(opp.id)} className="p-5 flex justify-between items-center cursor-pointer select-none group bg-white">
                      <div className="flex items-center gap-4 flex-1">
                        <button className="text-gray-400 group-hover:text-indigo-600 transition-colors">
                          {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                        </button>
                        <div>
                          <h2 className="font-semibold text-lg line-clamp-1 text-gray-900 group-hover:text-indigo-600 transition-colors">{opp.products?.title}</h2>
                          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                            <span>ASIN: {opp.products?.asin}</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                            <span className="uppercase font-bold text-indigo-500">{opp.status.replace('_', ' ')}</span>
                            <span className="w-1 h-1 bg-gray-300 rounded-full"></span>
                            <span className="text-gray-400">{opp.products?.category}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-bold">
                          <Euro className="h-4 w-4" /> {opp.profit_margin}% Margin
                        </span>
                        {/* Deep Dive Icon */}
                        <button 
                          onClick={(e) => { e.stopPropagation(); setSelectedDeal(opp); }} 
                          className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors"
                          title="Deep Dive Analytics"
                        >
                          <SearchCode className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    
                    {/* ACCORDION CONTENT (Expanded) */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50/30 animate-in slide-in-from-top-2 fade-in duration-200">
                        
                        {/* 2-COLUMN LAYOUT FOR EXPANDED CONTENT */}
                        <div className="p-5 flex flex-col lg:flex-row gap-5">
                          
                          {/* LEFT COLUMN: Prices, AI, Action Buttons */}
                          <div className="w-full lg:w-1/3 flex flex-col gap-4">
                            
                            {/* Prices Side-by-Side */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-white p-3 border border-gray-200 rounded-xl shadow-sm">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Buy Price</p>
                                <p className="text-xl font-extrabold text-gray-900">€{opp.buy_price}</p>
                              </div>
                              <div className="bg-indigo-50 p-3 border border-indigo-100 rounded-xl shadow-sm">
                                <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">Target Sell</p>
                                <p className="text-xl font-extrabold text-indigo-700">€{opp.target_sell_price}</p>
                              </div>
                            </div>
                            
                            {/* AI Decision Reasoning */}
                            {activeTab === 'pending' && (
                              <div className="bg-white p-4 border border-gray-200 rounded-xl shadow-sm flex-1 flex flex-col">
                                <h3 className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1">🧠 AI Decision</h3>
                                <p className="text-xs text-gray-600 italic leading-relaxed line-clamp-6">"{opp.ai_decision}"</p>
                              </div>
                            )}

                            {/* Ready Listing */}
                            {activeTab === 'inventory' && opp.generated_listings && opp.generated_listings.length > 0 && (
                              <div className="bg-white border border-indigo-100 rounded-xl p-3 shadow-sm flex-1 flex flex-col overflow-hidden">
                                <div className="flex justify-between items-start mb-2">
                                  <p className="font-bold text-indigo-900 text-[10px] uppercase tracking-wider">📝 Willhaben Listing</p>
                                </div>
                                <div className="flex justify-between items-start mb-2 group">
                                  <p className="font-bold text-gray-900 text-xs line-clamp-2 pr-2">{opp.generated_listings[0].generated_title}</p>
                                  <button onClick={() => copyToClipboard(opp.generated_listings[0].generated_title, `${opp.id}-title`)} className="text-indigo-500 hover:text-indigo-700 p-1 shrink-0 bg-indigo-50 rounded">
                                    {copiedId === `${opp.id}-title` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                  </button>
                                </div>
                                <div className="flex justify-between items-start pt-2 border-t border-gray-100 flex-1 group">
                                  <p className="text-[11px] text-gray-600 whitespace-pre-wrap line-clamp-6 pr-2">{opp.generated_listings[0].generated_description}</p>
                                  <button onClick={() => copyToClipboard(opp.generated_listings[0].generated_description, `${opp.id}-desc`)} className="text-indigo-500 hover:text-indigo-700 p-1 ml-2">
                                    {copiedId === `${opp.id}-desc` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Action Buttons (Stacked Vertically) */}
                            <div className="flex flex-col gap-2 mt-auto pt-2">
                              {opp.status === 'pending' && (<><a href={`https://amazon.de/dp/${opp.products?.asin}`} target="_blank" rel="noreferrer" className="w-full bg-gray-900 text-white text-center py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 flex justify-center items-center gap-2 transition-colors"><ShoppingCart className="h-4 w-4" /> Buy on Amazon</a><button onClick={() => updateStatus(opp.id, 'bought')} className="w-full bg-indigo-100 text-indigo-700 py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-200 flex justify-center items-center gap-2 transition-colors">Mark as Bought <ArrowRight className="h-4 w-4" /></button></>)}
                              {opp.status === 'bought' && (<button onClick={() => updateStatus(opp.id, 'in_inventory')} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-indigo-700 flex justify-center items-center gap-2 transition-colors"><Box className="h-4 w-4" /> Arrived (Add to Inventory)</button>)}
                              {opp.status === 'in_inventory' && (<button onClick={() => updateStatus(opp.id, 'listed')} className="w-full bg-purple-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-purple-700 flex justify-center items-center gap-2 transition-colors">Listed on Willhaben</button>)}
                              {opp.status === 'listed' && (<button onClick={() => updateStatus(opp.id, 'sold')} className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-bold hover:bg-green-700 flex justify-center items-center gap-2 transition-colors"><CheckCircle className="h-4 w-4" /> Item Sold! (Claim Profit)</button>)}
                              {opp.status === 'sold' && (<div className="w-full bg-green-50 text-green-700 py-2.5 rounded-lg text-sm font-bold flex justify-center items-center gap-2 border border-green-100"><CheckCircle className="h-5 w-5" /> Deal Closed</div>)}
                            </div>
                          </div>
                          
                          {/* RIGHT COLUMN: Massive Chart */}
                          <div className="w-full lg:w-2/3 min-h-[250px] bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col">
                            <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">5-Day Price Trend</h3>
                            {opp.products?.price_history && opp.products.price_history.length > 0 ? (
                              <div className="flex-1 w-full min-h-[200px]">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={formatChartData(opp.products.price_history)}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="date" tick={{fontSize: 10, fill: '#6B7280'}} tickLine={false} axisLine={false} />
                                    <YAxis domain={['auto', 'auto']} tick={{fontSize: 10, fill: '#6B7280'}} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val}`} width={40} />
                                    <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', fontSize: '12px', border: 'none', color: '#111827', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Line type="monotone" dataKey="price" stroke="#4f46e5" strokeWidth={3} dot={false} activeDot={{r: 5}} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            ) : (
                              <div className="flex-1 flex items-center justify-center text-gray-400 text-xs italic">No chart data</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* DEEP DIVE MODAL */}
        {selectedDeal && (
          <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 p-6 flex justify-between items-center z-10">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><SearchCode className="h-6 w-6 text-indigo-600" /> Deep Dive Analysis</h2>
                  <p className="text-sm text-gray-500 mt-1">{selectedDeal.products.title} (ASIN: {selectedDeal.products.asin})</p>
                </div>
                <button onClick={() => setSelectedDeal(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="h-6 w-6 text-gray-500" /></button>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100"><p className="text-sm text-indigo-600 font-semibold mb-1">Est. Monthly Sales</p><p className="text-3xl font-bold text-gray-900">450+ <span className="text-sm font-normal text-gray-500">units</span></p></div>
                  <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100"><p className="text-sm text-indigo-600 font-semibold mb-1">Product Weight</p><p className="text-3xl font-bold text-gray-900">254 <span className="text-sm font-normal text-gray-500">grams</span></p></div>
                  <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100"><p className="text-sm text-indigo-600 font-semibold mb-1">Sales Rank (BSR)</p><p className="text-3xl font-bold text-gray-900">#12 <span className="text-sm font-normal text-gray-500">in Electronics</span></p></div>
                </div>
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">12-Month Historical Price Trend (Simulated)</h3>
                  <div className="h-72 w-full bg-gray-50 border border-gray-100 rounded-xl p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={generateYearlyMockData(selectedDeal.buy_price)}>
                        <defs><linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="month" tick={{fontSize: 12, fill: '#6B7280'}} tickLine={false} axisLine={false} />
                        <YAxis tick={{fontSize: 12, fill: '#6B7280'}} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val}`} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="price" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorPrice)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <CommandBar />

      </div>
    </div>
  );
}