-- Create PRODUTOS table for Product Catalog & Inventory
create table if not exists public.produtos (
  id text primary key, -- Emprega IDs no formato de string (como "abcde12" criados pelo app) ou UUID
  user_id text not null references public.users(id) on delete cascade,
  
  -- Campos em inglês (Payload principal)
  description text,
  name text,
  cost_price numeric default 0,
  costPrice numeric default 0,
  sale_price numeric default 0,
  salePrice numeric default 0,
  profit numeric default 0,
  min_stock integer default 0,
  minStock integer default 0,
  current_stock integer default 0,
  currentStock integer default 0,

  -- Campos em português (Payload de fallback)
  nome text,
  descricao text,
  preco_custo numeric default 0,
  preco_venda numeric default 0,
  valor_custo numeric default 0,
  valor_venda numeric default 0,
  estoque_minimo integer default 0,
  estoque_atual integer default 0,
  lucro numeric default 0,
  
  created_at timestamptz default now()
);

-- Index para otimização de busca por usuário
create index if not exists idx_produtos_user_id on public.produtos(user_id);

-- Habilitar Row Level Security
alter table public.produtos enable row level security;

-- Política de acesso simples e permissivo para garantir sincronização local instantânea
create policy "Allow all actions for anon users on produtos" on public.produtos for all using (true) with check (true);
