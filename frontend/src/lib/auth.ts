import { supabase } from './supabase';

/**
 * True when the signed-in user is a Vindera admin.
 *
 * Backed by the `is_admin()` Postgres function (see
 * supabase/migrations/20260918084045_public_storefront_and_wishlists.sql),
 * which checks membership in `admin_users` — never trust the client alone,
 * every admin-only table is additionally RLS-gated on the same function.
 */
export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) return false;
  return Boolean(data);
}
