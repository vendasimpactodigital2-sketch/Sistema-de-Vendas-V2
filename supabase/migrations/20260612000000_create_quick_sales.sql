-- Create QUICK_SALES table for Vendas Rápidas customization
create table if not exists public.quick_sales (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  description text not null,
  price numeric default 0,
  cost numeric default 0,
  gradient text default 'from-purple-600 via-fuchsia-600 to-pink-500',
  created_at timestamptz default now()
);

-- Index for optimization of lookup by user
create index if not exists idx_quick_sales_user_id on public.quick_sales(user_id);

-- Enable Row Level Security
alter table public.quick_sales enable row level security;

-- Simple permissive policy for instant local sync
create policy "Allow all actions for anon users on quick_sales" on public.quick_sales for all using (true) with check (true);
