-- Source-filtered vector search
-- Allows searching only Gelly's content, or only training material
create or replace function match_chunks_by_source(
  query_embedding  vector(3072),
  match_count      int       default 6,
  filter_category  text      default null,
  allowed_sources  text[]    default null
)
returns table (
  id         uuid,
  content    text,
  category   text,
  source_type text,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    category,
    source_type,
    1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where approved = true
    and embedding is not null
    and (filter_category is null or category = filter_category)
    and (allowed_sources is null or source_type = any(allowed_sources))
  order by embedding <=> query_embedding
  limit match_count;
$$;
