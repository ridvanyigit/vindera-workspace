import { createClient } from '@supabase/supabase-js';

/**
 * Anonymous Supabase client for server-side reads (product pages, sitemap).
 * Same public-contract rule as the browser client: only the `storefront_listings`
 * view is read, with the anon key. No session is kept between requests.
 */
export const supabaseServer = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
