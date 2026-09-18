'use client';

/**
 * Customer sign-in / sign-up. Always lands on / (the storefront) — this page
 * has no notion of admin at all on purpose, see /admin/login for that
 * separate, unlinked portal.
 *
 * Google and Apple only work once their providers are turned on in the
 * Supabase dashboard (Authentication -> Providers) with real OAuth app
 * credentials from Google Cloud Console / the Apple Developer portal — that
 * external setup can't be done from here. Until then, Supabase returns a
 * "provider is not enabled" error when either button is clicked.
 */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Package, Lock, AlertCircle, CheckCircle2, ArrowRight, Eye, EyeOff } from 'lucide-react';

const GoogleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const AppleIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16.36 1.43c0 1.14-.42 2.2-1.24 3.05-.87.9-2.09 1.62-3.24 1.53-.14-1.13.44-2.29 1.2-3.09.85-.9 2.24-1.6 3.28-1.49zM20.57 17.37c-.41.94-.6 1.36-1.13 2.19-.74 1.16-1.78 2.6-3.07 2.61-1.14.02-1.44-.74-2.99-.73-1.55.01-1.87.75-3.02.73-1.29-.02-2.28-1.32-3.02-2.47-2.08-3.2-2.3-6.96-1.02-8.96.91-1.42 2.35-2.25 3.7-2.25 1.38 0 2.25.76 3.39.76 1.11 0 1.78-.76 3.38-.76 1.2 0 2.48.66 3.39 1.79-2.98 1.63-2.5 5.88.39 7.09z" />
  </svg>
);

export default function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const switchMode = (next: 'signin' | 'signup') => {
    setMode(next);
    setError('');
    setNotice('');
  };

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
    if (data?.session) {
      // Hard redirect so the auth cookies are refreshed before the store mounts.
      window.location.href = '/';
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    const { error, data } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    if (data?.session) {
      // Email confirmation is off for this project — the account is live immediately.
      window.location.href = '/';
      return;
    }
    setNotice('Account created! Check your email to confirm it, then sign in.');
    setLoading(false);
    setMode('signin');
  };

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` },
    });
    // On success Supabase navigates the browser away to the provider — only
    // an immediate failure (e.g. the provider isn't configured yet) lands here.
    if (error) setError(error.message);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center text-indigo-600">
          <Package className="h-12 w-12" />
        </div>
        <h1 className="mt-6 text-center text-[28px] font-semibold tracking-[-0.025em] text-gray-900">
          Vindera
        </h1>
        <p className="mt-2 text-center text-[13px] text-gray-500">
          {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm border border-gray-100 sm:rounded-xl sm:px-10">

          <div className="mb-6 flex bg-gray-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`flex-1 text-[13px] py-2 font-semibold rounded-md transition-colors ${mode === 'signin' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 text-[13px] py-2 font-semibold rounded-md transition-colors ${mode === 'signup' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Sign Up
            </button>
          </div>

          <div className="mb-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white py-2.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <GoogleIcon /> Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleOAuth('apple')}
              className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-gray-900 bg-gray-900 py-2.5 text-[13px] font-semibold text-white transition hover:bg-gray-800"
            >
              <AppleIcon /> Continue with Apple
            </button>
          </div>

          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">or with email</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <form className="space-y-6" onSubmit={mode === 'signin' ? handleLogin : handleSignUp}>
            <div>
              <label className="block text-[13px] font-medium text-gray-900 mb-1.5">Email address</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm text-[14px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-gray-900 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                  minLength={mode === 'signup' ? 6 : undefined}
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

            {notice && (
              <div className="bg-emerald-50 p-3 rounded-lg flex items-start gap-2 text-emerald-700 text-[13px]">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <p>{notice}</p>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-[14px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400"
            >
              {loading
                ? (mode === 'signin' ? 'Authenticating...' : 'Creating account...')
                : <>{mode === 'signin' ? 'Sign In' : 'Sign Up'} <ArrowRight className="h-4 w-4" /></>}
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
