-- =============================================================================
-- Private `invoices` storage bucket, readable and writable by admins only
-- =============================================================================
-- Why (launch-hardening audit):
--   S4  Invoices (which contain personal data) were uploaded to a bucket that
--       the admin UI read through `getPublicUrl`, i.e. anyone holding a link
--       could open them. The bucket and its policies were also created by hand
--       in the dashboard, so nothing in the repository described them.
--
-- What this migration does:
--   1. Creates (or forces) the `invoices` bucket as PRIVATE, limited to 10 MB
--      per file and to PDF / JPEG / PNG / WebP.
--   2. Removes any older policy on storage.objects that mentions the invoices
--      bucket (dashboard-made "public read" policies would otherwise keep the
--      files open, because permissive policies are OR-ed together).
--   3. Adds admin-only policies: SELECT, INSERT and UPDATE while
--      `public.is_admin()`. There is deliberately NO DELETE policy: invoices
--      are bookkeeping records and are retained.
--
-- The admin UI reads invoices through short-lived signed URLs (Phase 5).
--
-- Legacy files that were uploaded earlier stay in the bucket, but their old
-- public links stop working. Download and re-upload them through the app, then
-- clear `opportunities.invoice_url` (see docs/MANUEL-ADIMLAR.md).
--
-- A policy on ANOTHER bucket, or one without any bucket condition, cannot be
-- detected reliably here: check Storage -> Policies in the dashboard.
--
-- Idempotent: safe to run more than once. Skips with a NOTICE where the
-- storage schema does not exist.
-- =============================================================================

DO $$
DECLARE
  v_policy record;
BEGIN
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage schema not found; skipping invoices bucket setup';
    RETURN;
  END IF;

  -- 1. The bucket -----------------------------------------------------------
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'invoices', 'invoices', false, 10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  )
  ON CONFLICT (id) DO UPDATE
    SET public             = false,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- 2. Older policies that mention the invoices bucket ------------------------
  FOR v_policy IN
    SELECT policyname
      FROM pg_policies
     WHERE schemaname = 'storage'
       AND tablename  = 'objects'
       AND (COALESCE(qual, '') ILIKE '%invoices%' OR COALESCE(with_check, '') ILIKE '%invoices%')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', v_policy.policyname);
    RAISE NOTICE 'dropped storage policy "%" (it referenced the invoices bucket)', v_policy.policyname;
  END LOOP;

  -- 3. Admin-only policies ----------------------------------------------------
  CREATE POLICY "invoices_select_admin"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'invoices' AND public.is_admin());

  CREATE POLICY "invoices_insert_admin"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'invoices' AND public.is_admin());

  CREATE POLICY "invoices_update_admin"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'invoices' AND public.is_admin())
    WITH CHECK (bucket_id = 'invoices' AND public.is_admin());
END $$;
