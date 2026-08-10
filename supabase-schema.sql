-- Tabela de reuniões. A linha é criada quando a gravação termina (status
-- "gravada"); transcript/summary só são preenchidos ao clicar "Transcrever".
create table if not exists meetings (
  id uuid primary key, -- mesmo UUID gerado no client (meetingId)
  title text,
  status text default 'gravada', -- gravada | transcrevendo | transcrita
  transcript text,
  summary text,
  chunk_count int,
  created_at timestamptz default now()
);

-- Tabela de blocos de vídeo (cada gravação de ~5min). transcript fica null
-- até a transcrição sob demanda rodar.
create table if not exists meeting_chunks (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  chunk_index int not null,
  file_path text not null, -- caminho do vídeo no Storage
  transcript text,
  created_at timestamptz default now(),
  unique (meeting_id, chunk_index)
);

create index if not exists idx_meeting_chunks_meeting_id
  on meeting_chunks (meeting_id, chunk_index);

-- Bucket de storage para os vídeos (crie também pelo painel, privado).
-- Nome: "recordings".

-- === MIGRAÇÃO (se você já tinha as tabelas antigas, rode isto) ===
-- alter table meetings add column if not exists title text;
-- alter table meetings add column if not exists status text default 'gravada';
