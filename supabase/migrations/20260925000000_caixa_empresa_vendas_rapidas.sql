-- Migration: Caixa Status, Empresa Config, and Vendas Rápidas Itens
-- Allows seamless direct Supabase interaction and real-time listeners

-- 1. CAIXA_STATUS table
create table if not exists public.caixa_status (
  user_id text primary key,
  status text not null check (status in ('ABERTO', 'FECHADO', 'aberto', 'fechado')),
  updated_at timestamptz default now()
);

alter table public.caixa_status enable row level security;
drop policy if exists "Allow all actions for anon users on caixa_status" on public.caixa_status;
create policy "Allow all actions for anon users on caixa_status" on public.caixa_status for all using (true) with check (true);

-- 2. EMPRESA_CONFIG table
create table if not exists public.empresa_config (
  user_id text primary key,
  nome text,
  trading_name text,
  logo text,
  updated_at timestamptz default now()
);

alter table public.empresa_config enable row level security;
drop policy if exists "Allow all actions for anon users on empresa_config" on public.empresa_config;
create policy "Allow all actions for anon users on empresa_config" on public.empresa_config for all using (true) with check (true);

-- 3. VENDAS_RAPIDAS_ITENS table
create table if not exists public.vendas_rapidas_itens (
  id text primary key,
  user_id text not null,
  description text,
  descricao text,
  price numeric default 0,
  preco numeric default 0,
  cost numeric default 0,
  custo numeric default 0,
  gradient text default 'from-purple-600 via-fuchsia-600 to-pink-500',
  cor text,
  created_at timestamptz default now()
);

create index if not exists idx_vendas_rapidas_itens_user_id on public.vendas_rapidas_itens(user_id);

alter table public.vendas_rapidas_itens enable row level security;
drop policy if exists "Allow all actions for anon users on vendas_rapidas_itens" on public.vendas_rapidas_itens;
create policy "Allow all actions for anon users on vendas_rapidas_itens" on public.vendas_rapidas_itens for all using (true) with check (true);

-- Enable realtime on tables if publication exists
do $$
begin
  alter publication supabase_realtime add table public.caixa_status;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.empresa_config;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.vendas_rapidas_itens;
exception when others then null;
end $$;
