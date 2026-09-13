'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Package, TrendingDown, Euro, RefreshCw, ShoppingCart, Search, Zap, CheckCircle, ArrowRight, Box, LineChart as ChartIcon, Copy, Check, Settings as SettingsIcon, Save, Wallet, TrendingUp, PiggyBank, LogOut, SearchCode, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format, parseISO } from 'date-fns';

interface PriceHistory { price_amazon: number; recorded_at: string; }
interface GeneratedListing { generated_title: string; generated_description: string; }
interface Opportunity {
  id: string; buy_price: number; target_sell_price: number; profit_margin: number; ai_decision: string; status: string;
  products: { title: string; asin: string; image_url: string | null; price_history: PriceHistory[]; };
  generated_listings: GeneratedListing[];
}

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanAsin, setScanAsin] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'inventory' | 'sold' | 'settings'>('pending');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [settings, setSettings] = useState({ minMargin: 30, maxBudget: 500, autoBuy: false });
  
  // Modal State for Deep Dive Analytics
  const [selectedDeal, setSelectedDeal] = useState<Opportunity | null>(null);

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
    const { data, error } = await supabase.from('opportunities').select(`id, buy_price, target_sell_price, profit_margin, ai_decision, status, products ( title, asin, image_url, price_history ( price_amazon, recorded_at ) ), generated_listings ( generated_title, generated_description )`).order('created_at', { ascending: false });
    if (!error) setOpportunities(data as any);
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

  if (!session) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-indigo-600"><RefreshCw className="h-8 w-8 animate-spin" /></div>;

  const filteredDeals = opportunities.filter((opp) => {
    if (activeTab === 'pending') return opp.status === 'pending';
    if (activeTab === 'inventory') return ['bought', 'in_inventory', 'listed'].includes(opp.status);
    if (activeTab === 'sold') return opp.status === 'sold';
    return false;
  });

  const formatChartData = (history: PriceHistory[]) => {
    if (!history) return [];
    return history.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()).map(item => ({ date: format(parseISO(item.recorded_at), 'MMM dd'), price: item.price_amazon }));
  };

  // Generate Fake 12-Month Data for the Deep Dive Modal
  const generateYearlyMockData = (currentPrice: number) => {
    const data = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for(let i=0; i<12; i++) {
      // Create some random fluctuations around a higher historical price, ending at current price
      const randomPrice = i === 11 ? currentPrice : currentPrice + (Math.random() * 50 + 20);
      data.push({ month: months[i], price: Math.round(randomPrice) });
    }
    return data;
  };

  const activeDealsCount = opportunities.filter(o => o.status === 'pending').length;
  const totalInvested = opportunities.filter(o => ['bought', 'in_inventory', 'listed', 'sold'].includes(o.status)).reduce((sum, o) => sum + Number(o.buy_price), 0);
  const expectedProfit = opportunities.filter(o => ['bought', 'in_inventory', 'listed'].includes(o.status)).reduce((sum, o) => sum + (Number(o.target_sell_price) - Number(o.buy_price)), 0);
  const realizedProfit = opportunities.filter(o => o.status === 'sold').reduce((sum, o) => sum + (Number(o.target_sell_price) - Number(o.buy_price)), 0);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8 transition-colors duration-200 relative">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-indigo-600 flex items-center gap-2"><Package className="h-8 w-8" /> Vindera Arbitrage</h1>
            <p className="text-gray-500 mt-1">Austrian Deal Hunter Dashboard (Willhaben)</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchOpportunities} className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button>
            <button onClick={handleLogout} className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-lg shadow-sm hover:bg-red-100 transition-colors"><LogOut className="h-4 w-4" /> Sign Out</button>
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

        {/* Manual Search - NOW ALWAYS VISIBLE */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><Search className="h-5 w-5 text-indigo-500"/> Manual Deal Scanner</h2>
          <form onSubmit={handleManualScan} className="flex gap-3">
            <input type="text" value={scanAsin} onChange={(e) => setScanAsin(e.target.value)} placeholder="Paste Amazon ASIN here (e.g. B09JQZ5DYM)" className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
            <button type="submit" disabled={isScanning} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2 disabled:bg-indigo-300"><Zap className="h-4 w-4" />{isScanning ? 'Scanning...' : 'Analyze Deal'}</button>
          </form>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-200/50 p-1 rounded-xl mb-6 w-fit">
          <button onClick={() => setActiveTab('pending')} className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'pending' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>🔥 New Deals</button>
          <button onClick={() => setActiveTab('inventory')} className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'inventory' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📦 My Inventory</button>
          <button onClick={() => setActiveTab('sold')} className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'sold' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>💰 Sold</button>
          <button onClick={() => setActiveTab('settings')} className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'settings' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'} flex items-center gap-2`}><SettingsIcon className="h-4 w-4"/> Settings</button>
        </div>

        {/* Settings Panel */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-2xl">
            <h2 className="text-2xl font-bold mb-6 border-b pb-4">System Configurations</h2>
            <div className="space-y-6">
              <div><label className="block text-sm font-medium mb-2">Minimum AI Profit Margin (%)</label><input type="number" value={settings.minMargin} onChange={e => setSettings({...settings, minMargin: Number(e.target.value)})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2" /></div>
              <div><label className="block text-sm font-medium mb-2">Maximum Deal Budget (€)</label><input type="number" value={settings.maxBudget} onChange={e => setSettings({...settings, maxBudget: Number(e.target.value)})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2" /></div>
              <button className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 flex items-center justify-center gap-2 mt-4"><Save className="h-5 w-5" /> Save Configuration</button>
            </div>
          </div>
        )}

        {/* Deals Grid */}
        {activeTab !== 'settings' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {loading ? (<p className="text-gray-500">Loading data...</p>) : filteredDeals.length === 0 ? (<p className="text-gray-500">No items found.</p>) : (
              filteredDeals.map((opp) => (
                <div key={opp.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col relative">
                  
                  {/* DEEP DIVE BUTTON */}
                  <button 
                    onClick={() => setSelectedDeal(opp)}
                    className="absolute top-4 right-4 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 p-2 rounded-full transition-colors z-10"
                    title="Deep Dive Analytics"
                  >
                    <SearchCode className="h-5 w-5" />
                  </button>

                  <div className="p-6 border-b border-gray-100 flex justify-between items-start pr-16">
                    <div>
                      <h2 className="font-semibold text-lg line-clamp-1">{opp.products?.title}</h2>
                      <p className="text-sm text-gray-500 mt-1">ASIN: {opp.products?.asin} | Status: <span className="uppercase font-bold text-indigo-500">{opp.status.replace('_', ' ')}</span></p>
                    </div>
                    <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold"><Euro className="h-4 w-4" /> {opp.profit_margin}%</span>
                  </div>
                  
                  <div className="p-6 grid grid-cols-2 gap-4 flex-1">
                    <div className="bg-gray-50 p-4 rounded-lg"><p className="text-sm text-gray-500">Buy Price</p><p className="text-xl font-bold">€{opp.buy_price}</p></div>
                    <div className="bg-indigo-50 p-4 rounded-lg"><p className="text-sm text-indigo-500">Willhaben Target</p><p className="text-xl font-bold text-indigo-700">€{opp.target_sell_price}</p></div>
                    
                    {opp.products?.price_history && opp.products.price_history.length > 0 && (
                      <div className="col-span-2 mt-2 h-40 bg-white border border-gray-100 rounded-lg p-2">
                        <h3 className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1 uppercase tracking-wider"><ChartIcon className="h-3 w-3" /> 5-Day Trend</h3>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={formatChartData(opp.products.price_history)}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{fontSize: 10, fill: '#6B7280'}} tickLine={false} axisLine={false} />
                            <YAxis domain={['auto', 'auto']} tick={{fontSize: 10, fill: '#6B7280'}} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val}`} />
                            <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', fontSize: '12px', border: 'none', color: '#111827', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Line type="monotone" dataKey="price" stroke="#4f46e5" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {activeTab === 'pending' && (
                      <div className="col-span-2 mt-2">
                        <h3 className="text-sm font-bold text-gray-700 mb-1">🧠 AI Decision:</h3>
                        <p className="text-sm text-gray-600 italic bg-gray-50 p-2 rounded border border-gray-100 line-clamp-2">"{opp.ai_decision}"</p>
                      </div>
                    )}

                    {activeTab === 'inventory' && opp.generated_listings && opp.generated_listings.length > 0 && (
                      <div className="col-span-2 mt-2">
                        <h3 className="text-sm font-bold text-indigo-600 mb-2 flex items-center gap-2">📝 Willhaben Listing Ready:</h3>
                        <div className="bg-white border border-indigo-100 rounded-lg p-3">
                          <div className="flex justify-between items-start mb-2">
                            <p className="font-bold text-gray-900 text-sm">{opp.generated_listings[0].generated_title}</p>
                            <button onClick={() => copyToClipboard(opp.generated_listings[0].generated_title, `${opp.id}-title`)} className="text-indigo-500 hover:text-indigo-700">
                              {copiedId === `${opp.id}-title` ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </button>
                          </div>
                          <div className="flex justify-between items-start mt-2 border-t border-gray-100 pt-2">
                            <p className="text-xs text-gray-600 whitespace-pre-wrap line-clamp-3">{opp.generated_listings[0].generated_description}</p>
                            <button onClick={() => copyToClipboard(opp.generated_listings[0].generated_description, `${opp.id}-desc`)} className="text-indigo-500 hover:text-indigo-700 ml-2">
                              {copiedId === `${opp.id}-desc` ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex gap-3">
                    {opp.status === 'pending' && (<><a href={`https://amazon.de/dp/${opp.products?.asin}`} target="_blank" rel="noreferrer" className="flex-1 bg-gray-900 text-white text-center py-2 rounded-lg text-sm font-medium hover:bg-gray-800 flex justify-center items-center gap-2"><ShoppingCart className="h-4 w-4" /> Buy on Amazon</a><button onClick={() => updateStatus(opp.id, 'bought')} className="flex-1 bg-indigo-100 text-indigo-700 py-2 rounded-lg text-sm font-medium hover:bg-indigo-200 flex justify-center items-center gap-2">Mark as Bought <ArrowRight className="h-4 w-4" /></button></>)}
                    {opp.status === 'bought' && (<button onClick={() => updateStatus(opp.id, 'in_inventory')} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex justify-center items-center gap-2"><Box className="h-4 w-4" /> Arrived (Add to Inventory)</button>)}
                    {opp.status === 'in_inventory' && (<button onClick={() => updateStatus(opp.id, 'listed')} className="flex-1 bg-purple-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex justify-center items-center gap-2">Listed on Willhaben</button>)}
                    {opp.status === 'listed' && (<button onClick={() => updateStatus(opp.id, 'sold')} className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 flex justify-center items-center gap-2"><CheckCircle className="h-4 w-4" /> Item Sold! (Claim Profit)</button>)}
                    {opp.status === 'sold' && (<div className="flex-1 bg-green-100 text-green-700 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2"><CheckCircle className="h-5 w-5" /> Deal Closed</div>)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* DEEP DIVE MODAL (Popup) */}
        {selectedDeal && (
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-100 p-6 flex justify-between items-center z-10">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <SearchCode className="h-6 w-6 text-indigo-600" /> Deep Dive Analysis
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">{selectedDeal.products.title} (ASIN: {selectedDeal.products.asin})</p>
                </div>
                <button onClick={() => setSelectedDeal(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="h-6 w-6 text-gray-500" />
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                    <p className="text-sm text-indigo-600 font-semibold mb-1">Est. Monthly Sales</p>
                    <p className="text-3xl font-bold text-gray-900">450+ <span className="text-sm font-normal text-gray-500">units</span></p>
                  </div>
                  <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                    <p className="text-sm text-indigo-600 font-semibold mb-1">Product Weight</p>
                    <p className="text-3xl font-bold text-gray-900">254 <span className="text-sm font-normal text-gray-500">grams</span></p>
                  </div>
                  <div className="bg-indigo-50 p-5 rounded-xl border border-indigo-100">
                    <p className="text-sm text-indigo-600 font-semibold mb-1">Sales Rank (BSR)</p>
                    <p className="text-3xl font-bold text-gray-900">#12 <span className="text-sm font-normal text-gray-500">in Electronics</span></p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">12-Month Historical Price Trend (Simulated)</h3>
                  <div className="h-72 w-full bg-gray-50 border border-gray-100 rounded-xl p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={generateYearlyMockData(selectedDeal.buy_price)}>
                        <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="month" tick={{fontSize: 12, fill: '#6B7280'}} tickLine={false} axisLine={false} />
                        <YAxis tick={{fontSize: 12, fill: '#6B7280'}} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val}`} />
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                        <Area type="monotone" dataKey="price" stroke="#4f46e5" strokeWidth={3} fillOpacity={1} fill="url(#colorPrice)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-100 p-5 rounded-xl">
                  <h3 className="text-sm font-bold text-yellow-800 mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4" /> Keepa AI Forecast (Simulated)
                  </h3>
                  <p className="text-sm text-yellow-700">
                    Based on the 12-month trend, this product historically drops in price during Q3 and rebounds in Q4. Buying at €{selectedDeal.buy_price} represents a <strong>strong opportunity</strong> before the holiday season demand spikes.
                  </p>
                </div>

              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}