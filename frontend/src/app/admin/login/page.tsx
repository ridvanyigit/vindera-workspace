'use client';

/**
 * Admin sign-in — a separate, unlinked portal from the customer /login.
 *
 * Nothing in the public storefront links here; an admin reaches it by
 * bookmarking the URL. That said, the real security boundary is server-side
 * (is_admin() + RLS, see supabase/migrations/20260918084045_*), not
 * obscurity: a signed-in account that isn't in `admin_users` is signed back
 * out and rejected here even if it somehow lands on this page.
 *
 * No sign-up — admins are provisioned directly in `admin_users` via SQL,
 * never through self-service.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { checkIsAdmin } from '@/lib/auth';
import { ShieldCheck, AlertCircle, ArrowRight, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { useDarkMode } from '@/lib/useDarkMode';

export default function AdminLogin() {
  const router = useRouter();
  const { dark, toggle: toggleDark } = useDarkMode();
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
      return;
    }
    if (!data?.session) {
      setLoading(false);
      return;
    }

    const admin = await checkIsAdmin();
    if (!admin) {
      await supabase.auth.signOut();
      setError('This account does not have admin access.');
      setLoading(false);
      return;
    }

    router.replace('/admin');
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors">

      {/* Dark/Light toggle — fixed top-right */}
      <button
        onClick={toggleDark}
        title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="fixed top-4 right-4 p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-indigo-600 dark:text-indigo-400">
          <ShieldCheck className="h-12 w-12" />
        </div>
        <h1 className="mt-6 text-center text-[26px] font-semibold tracking-[-0.02em] text-gray-900 dark:text-white">
          Vindera Admin
        </h1>
        <p className="mt-2 text-center text-[13px] text-gray-500 dark:text-gray-400">
          Back office — authorized accounts only
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-900 py-8 px-4 shadow-sm dark:shadow-xl border border-gray-200 dark:border-gray-800 sm:rounded-xl sm:px-10">
          <form className="space-y-6" onSubmit={handleLogin}>
            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-200 mb-1.5">Email address</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm text-[14px] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 transition-colors"
                placeholder="admin@vindera.com"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-200 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-4 py-3 pr-10 border border-gray-300 dark:border-gray-700 rounded-lg shadow-sm text-[14px] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-800 transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-3 rounded-lg flex items-start gap-2 text-red-600 dark:text-red-400 text-[13px]">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-lg text-[14px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 dark:disabled:bg-indigo-900 transition"
            >
              {loading ? 'Authenticating...' : <>Sign In <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
