/**
 * Authenticated client for the FastAPI backend.
 *
 * Every backend endpoint requires the logged-in admin's Supabase access token,
 * so admin pages call this instead of `fetch(apiUrl(...))`. It:
 *   - attaches `Authorization: Bearer <access token>`,
 *   - sends JSON when `json` is given,
 *   - signs out and redirects to /admin/login on a 401,
 *   - throws an `ApiError` with a readable message (FastAPI's `detail`) on any
 *     other non-2xx response, and on network failures.
 *
 * Callers decide how to show the error; they should not swallow it.
 */

import { apiUrl } from './api';
import { supabase } from './supabase';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ApiFetchInit extends Omit<RequestInit, 'body'> {
  /** Request body, serialised as JSON. */
  json?: unknown;
}

/** Turns a FastAPI error body into one readable sentence. */
function describeError(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;

  if (typeof detail === 'string' && detail) return detail;

  // Validation errors (422) arrive as a list of { loc, msg } objects.
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map(item => {
        const entry = item as { loc?: unknown[]; msg?: string };
        const field = Array.isArray(entry.loc) ? entry.loc.filter(part => part !== 'body').join('.') : '';
        const message = entry.msg ?? 'Invalid value';
        return field ? `${field}: ${message}` : message;
      })
      .join('; ');
  }

  if (status === 403) return 'You do not have permission to do this.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  return `Request failed with status ${status}.`;
}

export async function apiFetch<T = unknown>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { json, headers, ...rest } = init;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const requestHeaders = new Headers(headers);
  if (session?.access_token) requestHeaders.set('Authorization', `Bearer ${session.access_token}`);
  if (json !== undefined) requestHeaders.set('Content-Type', 'application/json');

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...rest,
      headers: requestHeaders,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and that the backend is running.');
  }

  if (res.status === 401) {
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') window.location.replace('/admin/login');
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) throw new ApiError(res.status, describeError(body, res.status));

  return body as T;
}

/** Readable text for anything a caught `apiFetch` call can throw. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Downloads a backend file (for example a CSV) through the authenticated client. */
export async function apiDownload(path: string, filename: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and that the backend is running.');
  }

  if (res.status === 401) {
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') window.location.replace('/admin/login');
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    throw new ApiError(res.status, describeError(body, res.status));
  }

  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
