import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { DEFAULT_PROFIT_SETTINGS, profitSettingsFromRow, type ProfitSettings } from './profit';

export interface BusinessConfig {
  profit: ProfitSettings;
  returnWindowDays: number;
  /** false until the row was read; the placeholder defaults are in use until then. */
  loaded: boolean;
}

const DEFAULT_CONFIG: BusinessConfig = { profit: DEFAULT_PROFIT_SETTINGS, returnWindowDays: 30, loaded: false };

/** The owner's `business_settings` row (admin-readable), for live profit previews. The backend recomputes on save. */
export function useBusinessConfig(): BusinessConfig {
  const [config, setConfig] = useState<BusinessConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('business_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setConfig({
          profit: profitSettingsFromRow(data),
          returnWindowDays: Number(data.return_window_days) || 30,
          loaded: true,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
