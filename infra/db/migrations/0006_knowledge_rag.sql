-- RAG side of the knowledge base: chunk embeddings and the similarity search function.
-- Moved out of 0001_consolidated_schema.sql because it depends on knowledge.objects, which
-- 0003_admin_knowledge.sql creates -- a forward dependency that made 0001 unapplicable in
-- numeric order on a fresh database.
--
-- object_id is TEXT here, matching knowledge.objects.id as 0003 (and PgKnowledgeRepository)
-- define it. It was uuid when this block lived in 0001, against that file's own competing
-- uuid-keyed knowledge.objects.

create index if not exists knowledge_objects_tags_idx on knowledge.objects using gin (tags);
create index if not exists knowledge_objects_concerns_idx on knowledge.objects using gin (concerns);

create table if not exists knowledge.embeddings (
  id              uuid primary key default gen_random_uuid(),
  object_id       text not null references knowledge.objects on delete cascade,
  chunk_index     int not null,
  content         text not null,
  embedding       vector(1536) not null,
  embedding_model text not null,
  is_active       boolean not null default true,
  unique (object_id, chunk_index, embedding_model)
);
create index if not exists knowledge_embeddings_hnsw_idx
  on knowledge.embeddings using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

-- The retrieval path. `o.status = 'approved'` is the hard filter that makes SME approval
-- mean something at query time: an object that has not been approved, or that was edited back
-- into review, cannot be returned to the model no matter what the caller asks for. This
-- mirrors PgKnowledgeRepository.searchRetrievable()'s own hard-coded filter -- both sides of
-- retrieval enforce it independently.
create or replace function knowledge.match(
  query vector(1536), threshold float, k int,
  types text[] default null, concerns skin_concern[] default null
)
returns table (embedding_id uuid, object_id text, chunk_index int, content text, similarity float)
language sql stable as $$
  select e.id, e.object_id, e.chunk_index, e.content, 1 - (e.embedding <=> query)
  from knowledge.embeddings e
  join knowledge.objects o on o.id = e.object_id
  where e.is_active
    and o.status = 'approved'
    and (types is null or o.type = any(types))
    and (concerns is null or o.concerns && concerns)
    and 1 - (e.embedding <=> query) >= threshold
  order by e.embedding <=> query
  limit k;
$$;
