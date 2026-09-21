/**
 * What the storefront selects from the public `storefront_listings` view.
 * Listing pages fetch only the card columns (no ad text), never `select('*')`.
 */

/** Columns a product card needs. */
export const CARD_COLUMNS =
  'id, target_sell_price, product_condition, willhaben_url, status, title, image_url, category, created_at';

/** Columns of the detail page: the card columns plus gallery and ad copy. */
export const DETAIL_COLUMNS = `${CARD_COLUMNS}, gallery_image_urls, generated_title, generated_description`;

/** Items per page in a category grid. */
export const PAGE_SIZE = 24;

/** Newest listings the homepage rails are built from. */
export const HOME_LIMIT = 60;
