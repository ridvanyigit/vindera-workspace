'use client';

/** Supabase email/password sign-in. Entry point for every protected route. */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Package, Lock, AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      setError(error.message);
      setLoading(false);
    } else if (data?.session) {
      // Hard redirect so the auth cookies are refreshed before the dashboard mounts
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-indigo-600">
          <Package className="h-12 w-12" />
        </div>
        <h1 className="mt-6 text-center text-[28px] font-semibold tracking-[-0.025em] text-gray-900">
          Vindera Arbitrage
        </h1>
        <p className="mt-2 text-center text-[13px] text-gray-500">
          Authorized Personnel Only
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-gray-100 sm:rounded-xl sm:px-10">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-[13px] font-medium text-gray-900 mb-1.5">Email address</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm text-[14px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                placeholder="admin@vindera.com"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-gray-900 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg shadow-sm text-[14px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  placeholder="••••••••"
                />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 p-3 rounded-lg flex items-start gap-2 text-red-700 text-[13px]">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-[14px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400"
            >
              {loading ? 'Authenticating...' : <>Sign In <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
          
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Lock className="h-3 w-3" /> Protected by Supabase Auth
          </div>
        </div>
      </div>
    </div>
  );
}