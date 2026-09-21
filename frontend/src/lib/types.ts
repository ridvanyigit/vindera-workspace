/** Row shape of the public `storefront_listings` view — see supabase/migrations. */
export interface StorefrontListing {
  id: string;
  target_sell_price: number;
  product_condition: string | null;
  willhaben_url: string | null;
  status: string;
  title: string;
  image_url: string | null;
  category: string | null;
  gallery_image_urls: string[] | null;
  generated_title: string | null;
  generated_description: string | null;
  created_at: string;
}

/** The columns product cards need (see CARD_COLUMNS in lib/storefront.ts). */
export type StorefrontCardListing = Pick<
  StorefrontListing,
  'id' | 'target_sell_price' | 'product_condition' | 'willhaben_url' | 'status' | 'title' | 'image_url' | 'category' | 'created_at'
>;
