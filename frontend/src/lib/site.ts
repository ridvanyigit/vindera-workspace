/**
 * Public origin of the storefront, used for canonical links, Open Graph tags,
 * the sitemap and robots.txt. Set NEXT_PUBLIC_SITE_URL (e.g. https://vindera.at)
 * in production; the fallback only serves local development.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
