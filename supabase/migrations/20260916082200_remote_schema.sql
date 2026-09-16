CREATE TABLE "public"."events_calendar" (
  "id"                uuid                   NOT NULL DEFAULT gen_random_uuid(),
  "event_name"        character varying(100) NOT NULL,
  "event_date"        date                   NOT NULL,
  "target_categories" text[],
  CONSTRAINT "events_calendar_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."events_calendar"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."generated_listings" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "opportunity_id"        uuid,
  "target_platform"       character varying(50)    NOT NULL,
  "language"              character varying(10)    NOT NULL,
  "generated_title"       text                     NOT NULL,
  "generated_description" text                     NOT NULL,
  "created_at"            timestamp with time zone DEFAULT now(),
  CONSTRAINT "generated_listings_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."opportunities" (
  "id"                        uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "product_id"                uuid,
  "buy_price"                 numeric(10,2)            NOT NULL,
  "target_sell_price"         numeric(10,2),
  "profit_margin"             numeric(5,2),
  "ai_decision"               text,
  "status"                    character varying(50)    DEFAULT 'pending'::character varying,
  "created_at"                timestamp with time zone DEFAULT now(),
  "buybox_seller"             character varying(100)   DEFAULT 'Amazon'::character varying,
  "buybox_is_fba"             boolean                  DEFAULT true,
  "deal_score"                integer                  DEFAULT 0,
  "holding_period_months"     integer                  DEFAULT 0,
  "seasonality_analysis"      text,
  "sku"                       character varying(50),
  "emergency_sell_price"      numeric(10,2),
  "warehouse_location"        character varying(20)    DEFAULT 'UNASSIGNED'::character varying,
  "product_condition"         character varying(20)    DEFAULT 'NEW'::character varying,
  "days_in_inventory"         integer                  DEFAULT 0,
  "is_quarantine"             boolean                  DEFAULT false,
  "score_breakdown"           jsonb,
  "willhaben_realistic_price" numeric(10,2),
  "purchase_thesis"           text,
  "invoice_url"               text,
  CONSTRAINT "opportunities_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."price_history" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "product_id"   uuid,
  "price_amazon" numeric(10,2),
  "price_buybox" numeric(10,2),
  "is_deal"      boolean                  DEFAULT false,
  "recorded_at"  timestamp with time zone DEFAULT now(),
  CONSTRAINT "price_history_pkey" PRIMARY KEY (id)
);

CREATE TABLE "public"."products" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "asin"          character varying(20)    NOT NULL,
  "amazon_locale" character varying(10)    NOT NULL,
  "title"         text                     NOT NULL,
  "category"      character varying(100),
  "image_url"     text,
  "created_at"    timestamp with time zone DEFAULT now(),
  CONSTRAINT "products_asin_amazon_locale_key" UNIQUE (asin, amazon_locale),
  CONSTRAINT "products_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."generated_listings"
  ADD CONSTRAINT "generated_listings_opportunity_id_fkey" FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;

ALTER TABLE "public"."opportunities"
  ADD CONSTRAINT "opportunities_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE "public"."price_history"
  ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."events_calendar" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."generated_listings" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."opportunities" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."price_history" TO "anon", "authenticated", "postgres", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "anon", "authenticated", "postgres", "service_role";

