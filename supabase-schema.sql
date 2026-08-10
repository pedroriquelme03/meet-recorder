-- Tabela de reuniões (registro final, criado no /finalize)
create table if not exists meetings (
  id uuid primary key, -- mesmo UUID gerado no client (meetingId)
  transcript text,
  summary text,
  chunk_count int,
  created_at timestamptz default now()
);

-- Tabela de blocos individuais (cada gravação de ~8min já transcrita)
create table if not exists meeting_chunks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  chunk_index int not null,
  file_path text not null,
  transcript text,
  created_at timestamptz default now(),
  unique (meeting_id, chunk_index)
);

create index if not exists idx_meeting_chunks_meeting_id
  on meeting_chunks (meeting_id, chunk_index);

-- Bucket de storage para os arquivos de áudio (crie também pelo painel do Supabase)
-- Nome sugerido: "recordings", acesso privado (não público)
