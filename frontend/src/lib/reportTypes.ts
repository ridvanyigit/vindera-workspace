/** Shape of GET /reports/summary (see supabase/migrations/20260921091200_report_summary.sql). */

export interface ReportMonth {
  month: number;
  revenue: number;
  cogs: number;
  shipping: number;
  platform_fees: number;
  gross_profit: number;
}

export interface ReportCategory {
  category: string;
  revenue: number;
  cogs: number;
  gross_profit: number;
  units: number;
}

export interface ReportSummary {
  year: number;
  management: {
    revenue: number;
    cogs: number;
    shipping: number;
    platform_fees: number;
    gross_profit: number;
    expenses_total: number;
    profit_before_tax: number;
    units_sold: number;
    roi_pct: number | null;
    monthly: ReportMonth[];
    by_category: ReportCategory[];
  };
  cash: {
    income: number;
    purchases: number;
    purchases_estimated_date: number;
    shipping: number;
    platform_fees: number;
    expenses: number;
    result: number;
  };
  vat: { threshold: number; revenue: number; pct: number; warn_pct: number };
  available_years: number[];
}
