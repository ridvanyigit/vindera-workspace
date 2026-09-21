/**
 * Invoice files: the one place the browser writes directly to Supabase (the
 * write-path exception in CLAUDE.md). The `invoices` bucket is private and only
 * admins can read or write it (migration 20260921090800), so a file is viewed
 * through a short-lived signed URL, never a public link.
 */

import { supabase } from '@/lib/supabase';

const BUCKET = 'invoices';
const SIGNED_URL_SECONDS = 600;

export const INVOICE_MAX_BYTES = 10 * 1024 * 1024;

// Mirrors the bucket's allowed_mime_types. The extension is derived from the type, not the file name.
const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const INVOICE_ACCEPT = Object.keys(EXTENSION_BY_TYPE).join(',');

/** A reason the file cannot be uploaded, or null when it is fine. */
export function invoiceFileProblem(file: File): string | null {
  if (!(file.type in EXTENSION_BY_TYPE)) return 'Only PDF, JPG, PNG or WebP files are accepted.';
  if (file.size > INVOICE_MAX_BYTES) return 'The file is larger than 10 MB.';
  if (file.size === 0) return 'The file is empty.';
  return null;
}

/** Uploads the file and stores its path on the deal. Throws a readable Error on failure. */
export async function uploadInvoice(dealId: string, file: File): Promise<void> {
  const problem = invoiceFileProblem(file);
  if (problem) throw new Error(problem);

  const path = `${dealId}/${Date.now()}.${EXTENSION_BY_TYPE[file.type]}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw new Error(error.message);

  // RLS filters a forbidden update down to zero rows without an error, so check the row count.
  const { data, error: updateError } = await supabase
    .from('opportunities')
    .update({ invoice_path: path })
    .eq('id', dealId)
    .select('id');
  if (updateError) throw new Error(updateError.message);
  if (!data || data.length === 0) throw new Error('The invoice was uploaded but could not be attached to the deal.');
}

/** Files uploaded before the bucket became private are stored as public URLs; this recovers their storage path. */
function legacyInvoicePath(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
}

/** A link that opens the deal's invoice for about ten minutes. Throws a readable Error on failure. */
export async function invoiceViewUrl(invoicePath: string | null | undefined, legacyUrl: string | null | undefined): Promise<string> {
  const path = invoicePath || (legacyUrl ? legacyInvoicePath(legacyUrl) : null);
  if (!path) throw new Error('This invoice link is not stored in a form the app can open. Attach the file again.');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) throw new Error(error?.message ?? 'Could not create a link for the invoice.');
  return data.signedUrl;
}
