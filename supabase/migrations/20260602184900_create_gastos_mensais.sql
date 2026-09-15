-- Create GASTOS_MENSAIS table for Monthly Bills & Daily Goals
create table if not exists public.gastos_mensais (
  id text primary key, -- Emprega IDs no formato de string (como offline IDs "bill-12345" criados pelo app)
  user_id text not null references public.users(id) on delete cascade,
  
  -- Campos em inglês (Payload principal)
  name text,
  description text,
  value numeric default 0,
  category text,
  due_date text,
  dueDate text,
  observation text,
  
  -- Campos em português (Payload de fallback)
  nome text,
  descricao text,
  valor numeric default 0,
  categoria text,
  vencimento text,
  observacao text,
  
  created_at timestamptz default now()
);

-- Index para otimização de busca por usuário
create index if not exists idx_gastos_mensais_user_id on public.gastos_mensais(user_id);

-- Habilitar Row Level Security para se alinhar ao padrão do restante do projeto
alter table public.gastos_mensais enable row level security;

-- Política de acesso simples e permissivo para garantir sincronização local instantânea
create policy "Allow all actions for anon users on gastos_mensais" on public.gastos_mensais for all using (true) with check (true);
