import type { MetadataRoute } from 'next';
import { supabaseServer } from '@/lib/supabaseServer';
import { SITE_URL } from '@/lib/site';

// Built per request: the listings change daily and must not be frozen at build time.
export const dynamic = 'force-dynamic';

const PAGE = 1000;
const MAX_PAGES = 10;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/impressum`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${SITE_URL}/datenschutz`, changeFrequency: 'yearly', priority: 0.1 },
  ];

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabaseServer
      .from('storefront_listings')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .order('id')
      .range(page * PAGE, (page + 1) * PAGE - 1);
    if (error || !data) break;
    for (const row of data) {
      entries.push({ url: `${SITE_URL}/product/${row.id}`, lastModified: row.created_at, changeFrequency: 'daily', priority: 0.7 });
    }
    if (data.length < PAGE) break;
  }
  return entries;
}
