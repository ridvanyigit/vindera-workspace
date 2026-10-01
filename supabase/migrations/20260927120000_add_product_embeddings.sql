-- =============================================================================
-- Product embeddings (pgvector) - learn/llmops Module 3
-- =============================================================================
-- Adds semantic "find similar products" search, backed by OpenAI
-- text-embedding-3-small (1536 dimensions). Lives on `products`, not
-- `opportunities`: the text that gets embedded (title + category) changes once
-- per product, not once per purchase, and it is `products` that is the "thing"
-- a similarity search is over.
--
-- HNSW/cosine was chosen over IVFFlat: it can be built before data exists (an
-- IVFFlat index's clustering quality depends on data already being loaded), and
-- cosine is the standard distance for text embeddings, where direction matters
-- more than magnitude.
--
-- `match_similar_products` is executable by service_role only, matching every
-- other RPC in this project - the browser can only SELECT.

create extension if not exists vector with schema extensions;

alter table public.products
  add column if not exists embedding extensions.vector(1536);

create index if not exists products_embedding_hnsw_idx
  on public.products
  using hnsw (embedding extensions.vector_cosine_ops);

create or replace function public.match_similar_products(
  p_product_id uuid,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  category text,
  similarity float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    p.id,
    p.title,
    p.category,
    1 - (p.embedding <=> source.embedding) as similarity
  from public.products p, (
    select embedding from public.products where id = p_product_id
  ) as source
  where p.id != p_product_id
    and p.embedding is not null
    and source.embedding is not null
  order by p.embedding <=> source.embedding
  limit match_count;
$$;

revoke all on function public.match_similar_products(uuid, int) from public, anon, authenticated;
grant execute on function public.match_similar_products(uuid, int) to service_role;
