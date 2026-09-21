import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/** scheme + host of an absolute URL, or null when the value is missing or invalid. */
function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:8000";
const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
// Supabase Realtime uses a websocket on the same host (https -> wss, http -> ws).
const supabaseRealtimeOrigin = supabaseOrigin ? supabaseOrigin.replace(/^http/, "ws") : null;

const connectSrc = [
  "'self'",
  apiOrigin,
  supabaseOrigin,
  supabaseRealtimeOrigin,
  "https://*.supabase.co",
  "wss://*.supabase.co",
  // Next.js dev server hot reload.
  ...(isDev ? ["ws://localhost:*", "ws://127.0.0.1:*"] : []),
].filter((source): source is string => Boolean(source));

// Next.js injects inline bootstrap scripts, so `script-src` needs 'unsafe-inline'
// (a nonce-based policy would force every page to render dynamically). React's
// dev build additionally needs 'unsafe-eval'. Product photos are pasted in as
// arbitrary https URLs (mostly Amazon's CDN), hence `img-src https:`.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Only when the API is https too, so a local production build against an http backend still works.
  ...(!isDev && apiOrigin.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
