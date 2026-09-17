/**
 * Shared vocabulary used across the workspace, product master and manual entry.
 *
 * `PRODUCT_CATEGORIES` MUST stay in sync with `CANONICAL_CATEGORIES` in
 * `backend/src/core/categories.py` — the backend maps Keepa's marketplace
 * category names onto exactly this list.
 */

export interface Option {
  value: string;
  label: string;
}

/** Categories a product can actually belong to. */
export const PRODUCT_CATEGORIES: Option[] = [
  { value: 'Technology & Electronics', label: 'Technology & Electronics' },
  { value: 'Home & Garden', label: 'Home & Garden' },
  { value: 'Fashion & Clothing', label: 'Fashion & Clothing' },
  { value: 'Toys & Baby', label: 'Toys & Baby' },
  { value: 'Sports & Outdoors', label: 'Sports & Outdoors' },
  { value: 'Automotive', label: 'Automotive' },
  { value: 'Books & Stationery', label: 'Books & Stationery' },
  { value: 'Other', label: 'Other' },
];

/** Same list prefixed with the "no filter" entry, for filter dropdowns. */
export const TARGET_CATEGORIES: Option[] = [
  { value: 'All', label: 'All Categories' },
  ...PRODUCT_CATEGORIES,
];

/** Opportunity lifecycle states, in pipeline order. */
export const STATUS_OPTIONS: Option[] = [
  { value: 'pending', label: 'Pending — not bought yet' },
  { value: 'bought', label: 'Bought — awaiting receiving check' },
  { value: 'in_inventory', label: 'In Inventory — received and stored' },
  { value: 'listed', label: 'Listed — live on Willhaben' },
  { value: 'sold', label: 'Sold — deal closed' },
  { value: 'rejected', label: 'Rejected — failed the No-Buy rules' },
];

/** Physical condition recorded during the receiving check. */
export const CONDITION_OPTIONS: Option[] = [
  { value: 'NEW', label: 'New — sealed, untouched' },
  { value: 'OPEN BOX', label: 'Open Box — opened but undamaged' },
  { value: 'REVIEW NEEDED', label: 'Review Needed — inspect before listing' },
];

/** The seven criteria behind the AI acquisition scorecard (0-10 each). */
export const SCORE_CRITERIA: { key: string; label: string; hint: string }[] = [
  { key: 'discount', label: 'Discount', hint: 'How far below its usual Amazon price is it right now? 10 = exceptional drop.' },
  { key: 'demand', label: 'Demand', hint: 'How many people search for this on Willhaben Austria? 10 = sells itself.' },
  { key: 'competition', label: 'Competition', hint: 'Fewer competing listings scores higher. 10 = almost no one else selling it.' },
  { key: 'capital_efficiency', label: 'Capital Efficiency', hint: 'How little money it ties up. Cheap, fast-turning items score higher.' },
  { key: 'storage_size', label: 'Storage Size', hint: 'How easy it is to store at home. Small and light scores higher.' },
  { key: 'risk_level', label: 'Risk Level', hint: 'Lower risk scores higher. Sealed electronics from Amazon = 9-10, fragile or fakeable goods = low.' },
  { key: 'seasonality', label: 'Seasonality', hint: 'Is this a good moment to buy given upcoming holidays and events? 10 = perfect timing.' },
];
