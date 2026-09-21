'use client';

/**
 * Latest scan jobs (GET /deals/scans), shown inside the AI terminal panel so a
 * failed scan (Keepa tokens, OpenAI, missing data) is visible instead of silent.
 * Polls while a job is still queued or running.
 */

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch, ApiError } from '@/lib/apiFetch';

interface ScanJob {
  id: string;
  asin: string;
  status: 'queued' | 'running' | 'succeeded' | 'rejected' | 'failed';
  error: string | null;
  retry_after: string | null;
  created_at: string;
  finished_at: string | null;
}

const STATUS_STYLES: Record<ScanJob['status'], string> = {
  queued: 'bg-gray-100 text-gray-600',
  running: 'bg-indigo-50 text-indigo-700',
  succeeded: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
};

const POLL_INTERVAL_MS = 10_000;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ScanStatusList() {
  const [jobs, setJobs] = useState<ScanJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ jobs: ScanJob[] }>('/deals/scans');
      setJobs(data.jobs);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Unable to reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  const hasActiveJob = jobs?.some(job => job.status === 'queued' || job.status === 'running') ?? false;
  useEffect(() => {
    if (!hasActiveJob) return;
    const timer = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveJob, load]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="type-label text-gray-500">Latest scans</span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-gray-500 hover:text-indigo-600 transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {jobs !== null && jobs.length === 0 && !error && (
        <div className="text-[13px] text-gray-400 italic">No scans yet.</div>
      )}

      {jobs?.map(job => (
        <div key={job.id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[13px] font-semibold text-gray-800">{job.asin}</span>
            <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${STATUS_STYLES[job.status]}`}>
              {job.status}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">{formatTime(job.created_at)}</div>
          {job.error && <div className="mt-1 text-[12px] text-red-700 break-words">{job.error}</div>}
        </div>
      ))}
    </div>
  );
}
