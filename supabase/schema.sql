-- Enable vector extension
create extension if not exists vector;

-- Knowledge chunks: the searchable units of Gelly's content
create table knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  content     text not null,
  embedding   vector(3072),         -- gemini-embedding-001 dimension
  source_type text not null,        -- 'recording' | 'script' | 'notes' | 'photo'
  source_name text,                 -- original file/doc name
  category    text,                 -- 'opener' | 'pitch' | 'objection' | 'close' | 'tonality' | 'cancel' | 'general'
  approved    boolean default false, -- admin must approve before it's searchable
  created_at  timestamptz default now()
);

-- Index for category filtering
create index on knowledge_chunks (category, approved);

-- Function: semantic search over approved chunks
create or replace function match_chunks(
  query_embedding vector(3072),
  match_count     int     default 8,
  filter_category text    default null
)
returns table (
  id       uuid,
  content  text,
  category text,
  similarity float
)
language sql stable
as $$
  select
    id,
    content,
    category,
    1 - (embedding <=> query_embedding) as similarity
  from knowledge_chunks
  where approved = true
    and (filter_category is null or category = filter_category)
  order by embedding <=> query_embedding
  limit match_count;
$$;
