'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Package, TrendingDown, Euro, RefreshCw, ShoppingCart, Search, Zap } from 'lucide-react';

interface Opportunity {
  id: string;
  buy_price: number;
  target_sell_price: number;
  profit_margin: number;
  ai_decision: string;
  status: string;
  products: {
    title: string;
    asin: string;
    image_url: string | null;
  };
  generated_listings: {
    generated_title: string;
    generated_description: string;
  }[];
}

export default function Dashboard() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New States for Manual Scan
  const [scanAsin, setScanAsin] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const fetchOpportunities = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('opportunities')
      .select(`
        id, buy_price, target_sell_price, profit_margin, ai_decision, status,
        products ( title, asin, image_url ),
        generated_listings ( generated_title, generated_description )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching data:', error);
    } else {
      setOpportunities(data as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOpportunities();
  }, []);

  // Function to trigger Backend API
  const handleManualScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanAsin.trim()) return;
    
    setIsScanning(true);
    try {
      const res = await fetch('http://localhost:8000/api/v1/deals/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asin: scanAsin.trim() })
      });
      
      if (res.ok) {
        alert(`🚀 Scan pipeline started for ASIN: ${scanAsin}. \n\nAI is analyzing it. Refresh the page in 5-10 seconds!`);
        setScanAsin('');
        // Automatically refresh data after 5 seconds to show the new result
        setTimeout(() => fetchOpportunities(), 5000);
      } else {
        alert('Failed to connect to backend.');
      }
    } catch (error) {
      console.error(error);
      alert('Error triggering scan. Is the FastAPI server running on port 8000?');
    }
    setIsScanning(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-indigo-600 flex items-center gap-2">
              <Package className="h-8 w-8" /> Vindera Arbitrage
            </h1>
            <p className="text-gray-500 mt-1">Cross-Border Deal Hunter Dashboard</p>
          </div>
          <button 
            onClick={fetchOpportunities}
            className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>

        {/* Manual Search & Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Manual ASIN Scanner */}
          <div className="md:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Search className="h-5 w-5 text-indigo-500"/> Manual Deal Scanner
            </h2>
            <form onSubmit={handleManualScan} className="flex gap-3">
              <input 
                type="text" 
                value={scanAsin}
                onChange={(e) => setScanAsin(e.target.value)}
                placeholder="Paste Amazon ASIN here (e.g. B08N5WRWNW)"
                className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <button 
                type="submit" 
                disabled={isScanning}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:bg-indigo-300"
              >
                {isScanning ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {isScanning ? 'Scanning...' : 'Analyze Deal'}
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <TrendingDown className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">Active Deals</p>
              <p className="text-2xl font-bold">{opportunities.length}</p>
            </div>
          </div>
        </div>

        {/* Deals Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {loading ? (
            <p className="text-gray-500">Scanning Supabase for latest deals...</p>
          ) : opportunities.length === 0 ? (
            <p className="text-gray-500">No profitable deals found yet.</p>
          ) : (
            opportunities.map((opp) => (
              <div key={opp.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-start">
                  <div>
                    <h2 className="font-semibold text-lg line-clamp-1">{opp.products?.title}</h2>
                    <p className="text-sm text-gray-500 mt-1">ASIN: {opp.products?.asin}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-semibold">
                    <Euro className="h-4 w-4" /> {opp.profit_margin}% Margin
                  </span>
                </div>
                
                <div className="p-6 grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-500">Amazon Buy Price</p>
                    <p className="text-xl font-bold text-gray-900">€{opp.buy_price}</p>
                  </div>
                  <div className="bg-indigo-50 p-4 rounded-lg">
                    <p className="text-sm text-indigo-500">Willhaben Target Price</p>
                    <p className="text-xl font-bold text-indigo-700">€{opp.target_sell_price}</p>
                  </div>
                  
                  <div className="col-span-2 mt-2">
                    <h3 className="text-sm font-bold text-gray-700 mb-2">🧠 AI Decision Reasoning:</h3>
                    <p className="text-sm text-gray-600 italic bg-gray-50 p-3 rounded border border-gray-100">
                      "{opp.ai_decision}"
                    </p>
                  </div>

                  {opp.generated_listings && opp.generated_listings.length > 0 && (
                    <div className="col-span-2 mt-4">
                      <h3 className="text-sm font-bold text-indigo-600 mb-2">📝 AI Generated Willhaben Listing (DE):</h3>
                      <div className="bg-white border border-indigo-100 rounded-lg p-4">
                        <p className="font-bold text-gray-900 mb-2">{opp.generated_listings[0].generated_title}</p>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">
                          {opp.generated_listings[0].generated_description}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex gap-3">
                  <a 
                    href={`https://amazon.de/dp/${opp.products?.asin}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex-1 bg-gray-900 text-white text-center py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                  >
                    <ShoppingCart className="h-4 w-4" /> Buy on Amazon
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}