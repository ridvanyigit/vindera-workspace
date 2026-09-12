'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Package, TrendingDown, Euro, RefreshCw, ShoppingCart, Search, Zap, CheckCircle, ArrowRight, Box, LineChart as ChartIcon, Copy, Check, Settings as SettingsIcon, Save } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';

interface PriceHistory { price_amazon: number; recorded_at: string; }
interface GeneratedListing { generated_title: string; generated_description: string; }
interface Opportunity {
  id: string; buy_price: number; target_sell_price: number; profit_margin: number; ai_decision: string; status: string;
  products: { title: string; asin: string; image_url: string | null; price_history: PriceHistory[]; };
  generated_listings: GeneratedListing[];
}

export default function Dashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanAsin, setScanAsin] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<'pending' | 'inventory' | 'sold' | 'settings'>('pending');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Settings State (Mocking local state for now)
  const [settings, setSettings] = useState({ minMargin: 30, maxBudget: 500, autoBuy: false });

  const fetchOpportunities = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('opportunities')
      .select(`
        id, buy_price, target_sell_price, profit_margin, ai_decision, status,
        products ( title, asin, image_url, price_history ( price_amazon, recorded_at ) ),
        generated_listings ( generated_title, generated_description )
      `)
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching data:', error);
    else setOpportunities(data as any);
    setLoading(false);
  };

  useEffect(() => { fetchOpportunities(); }, []);

  const handleManualScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanAsin.trim()) return;
    setIsScanning(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/deals/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ asin: scanAsin.trim() })
      });
      if (res.ok) {
        setScanAsin('');
        setTimeout(() => fetchOpportunities(), 5000); 
      }
    } catch (error) { console.error(error); }
    setIsScanning(false);
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/deals/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) fetchOpportunities();
    } catch (error) { console.error('Failed to update status', error); }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredDeals = opportunities.filter((opp) => {
    if (activeTab === 'pending') return opp.status === 'pending';
    if (activeTab === 'inventory') return ['bought', 'in_inventory', 'listed'].includes(opp.status);
    if (activeTab === 'sold') return opp.status === 'sold';
    return false;
  });

  const formatChartData = (history: PriceHistory[]) => {
    if (!history) return [];
    return history.sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime())
      .map(item => ({ date: format(parseISO(item.recorded_at), 'MMM dd'), price: item.price_amazon }));
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div><h1 className="text-3xl font-bold text-indigo-600 flex items-center gap-2"><Package className="h-8 w-8" /> Vindera Arbitrage</h1><p className="text-gray-500 mt-1">Austrian Deal Hunter Dashboard (Willhaben)</p></div>
          <button onClick={fetchOpportunities} className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh Data</button>
        </div>

        {/* Manual Search */}
        {activeTab !== 'settings' && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2"><Search className="h-5 w-5 text-indigo-500"/> Manual Deal Scanner</h2>
            <form onSubmit={handleManualScan} className="flex gap-3">
              <input type="text" value={scanAsin} onChange={(e) => setScanAsin(e.target.value)} placeholder="Paste Amazon ASIN here (e.g. B09Y2MYL5C)" className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" required />
              <button type="submit" disabled={isScanning} className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 flex items-center gap-2 disabled:bg-indigo-300">{isScanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}{isScanning ? 'Scanning...' : 'Analyze Deal'}</button>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-200/50 p-1 rounded-xl mb-6 w-fit">
          <button onClick={() => setActiveTab('pending')} className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'pending' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>🔥 New Deals</button>
          <button onClick={() => setActiveTab('inventory')} className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'inventory' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>📦 My Inventory</button>
          <button onClick={() => setActiveTab('sold')} className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'sold' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>💰 Sold (Profit)</button>
          <button onClick={() => setActiveTab('settings')} className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${activeTab === 'settings' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'} flex items-center gap-2`}><SettingsIcon className="h-4 w-4"/> Settings</button>
        </div>

        {/* Settings Panel */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-2xl">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b pb-4">System Configurations</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Minimum AI Profit Margin (%)</label>
                <input type="number" value={settings.minMargin} onChange={e => setSettings({...settings, minMargin: Number(e.target.value)})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2" />
                <p className="text-xs text-gray-500 mt-1">AI will ignore deals with a profit margin lower than this value.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Maximum Deal Budget (€)</label>
                <input type="number" value={settings.maxBudget} onChange={e => setSettings({...settings, maxBudget: Number(e.target.value)})} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2" />
                <p className="text-xs text-gray-500 mt-1">Do not notify me for items that cost more than this amount.</p>
              </div>

              <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div>
                  <h3 className="font-medium text-gray-900">Auto-Buy Enabled (Beta)</h3>
                  <p className="text-xs text-gray-500">Allow AI to automatically purchase deals via Amazon API if criteria are met.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={settings.autoBuy} onChange={e => setSettings({...settings, autoBuy: e.target.checked})} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <button className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 flex items-center justify-center gap-2 mt-4">
                <Save className="h-5 w-5" /> Save Configuration
              </button>
            </div>
          </div>
        )}

        {/* Deals Grid */}
        {activeTab !== 'settings' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {loading ? (<p className="text-gray-500">Loading data...</p>) : filteredDeals.length === 0 ? (<p className="text-gray-500">No items found.</p>) : (
              filteredDeals.map((opp) => (
                <div key={opp.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                  {/* ... (Existing Deal Card Content - Keeping it exactly the same) ... */}
                  <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                    <div>
                      <h2 className="font-semibold text-lg line-clamp-1">{opp.products?.title}</h2>
                      <p className="text-sm text-gray-500 mt-1">ASIN: {opp.products?.asin} | Status: <span className="uppercase font-bold text-indigo-500">{opp.status.replace('_', ' ')}</span></p>
                    </div>
                    <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold"><Euro className="h-4 w-4" /> {opp.profit_margin}%</span>
                  </div>
                  
                  <div className="p-6 grid grid-cols-2 gap-4 flex-1">
                    <div className="bg-gray-50 p-4 rounded-lg"><p className="text-sm text-gray-500">Amazon Buy Price</p><p className="text-xl font-bold">€{opp.buy_price}</p></div>
                    <div className="bg-indigo-50 p-4 rounded-lg"><p className="text-sm text-indigo-500">Willhaben Target</p><p className="text-xl font-bold text-indigo-700">€{opp.target_sell_price}</p></div>
                    
                    {opp.products?.price_history && opp.products.price_history.length > 0 && (
                      <div className="col-span-2 mt-2 h-40 bg-white border border-gray-100 rounded-lg p-2">
                        <h3 className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1 uppercase tracking-wider"><ChartIcon className="h-3 w-3" /> 5-Day Trend</h3>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={formatChartData(opp.products.price_history)}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="date" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                            <YAxis domain={['auto', 'auto']} tick={{fontSize: 10}} tickLine={false} axisLine={false} tickFormatter={(val) => `€${val}`} />
                            <Tooltip contentStyle={{ borderRadius: '8px', fontSize: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
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
      </div>
    </div>
  );
}