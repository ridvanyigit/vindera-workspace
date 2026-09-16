/**
 * FastAPI backend client.
 *
 * The base URL comes from NEXT_PUBLIC_API_URL so that local development, preview
 * and production deployments all point at the right host. It falls back to the
 * local backend so `npm run dev` works without any extra setup.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:8000';

/** Build an absolute URL for a backend endpoint, e.g. apiUrl('/deals/scan'). */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}/api/v1${path.startsWith('/') ? path : `/${path}`}`;
}
