-- INITIAL SCHEMA MIGRATION FOR GRÁFICA DESIGNER / NÚCLEO
-- This migration script creates the necessary tables to store users, company profiles, sales, budgets, expenses, and system configurations.
-- You can run this directly in the Supabase SQL Editor.

-- Enable UUID extension just in case
create extension if not exists "uuid-ossp";

-- 1. Create USERS table
create table if not exists public.users (
  id text primary key, -- Custom ID matching existing offline IDs
  name text not null,
  username text unique not null,
  email text,
  password text not null, -- Simple password hashing can be done or stored as-is for custom login
  created_at timestamptz default now()
);

-- Index on username for fast login lookups
create index if not exists idx_users_username on public.users(username);

-- 2. Create COMPANY_PROFILE table
create table if not exists public.company_profile (
  user_id text primary key references public.users(id) on delete cascade,
  trading_name text not null,
  phone text,
  cep text,
  address text,
  number text,
  neighborhood text,
  city text,
  state text,
  cnpj_cpf text,
  logo text, -- Stores Base64 string or URL of the corporate logo
  updated_at timestamptz default now()
);

-- 3. Create SALES table (also handles budget with is_budget = true)
create table if not exists public.sales (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  client_name text not null,
  client_phone text,
  items jsonb default '[]'::jsonb, -- Array of ProductSaleItem
  use_motoboy boolean default false,
  motoboy_cost numeric default 0,
  discount numeric default 0,
  down_payment numeric default 0,
  operation_cost numeric default 0,
  cost_items jsonb default '[]'::jsonb, -- Array of CostItem
  total_value numeric default 0,
  balance_due numeric default 0,
  net_profit numeric default 0,
  client_image text, -- Stores Base64 string or URL of client-provided references
  date timestamptz not null,
  is_budget boolean default false,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_sales_user_id on public.sales(user_id);
create index if not exists idx_sales_is_budget on public.sales(is_budget);
create index if not exists idx_sales_date on public.sales(date);

-- 4. Create EXPENSES table
create table if not exists public.expenses (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  description text not null,
  value numeric not null,
  date timestamptz not null,
  category text not null,
  created_at timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_expenses_user_id on public.expenses(user_id);
create index if not exists idx_expenses_date on public.expenses(date);

-- 5. Create GOALS table
create table if not exists public.goals (
  user_id text primary key references public.users(id) on delete cascade,
  goal_value numeric default 0,
  goal_type text default 'daily',
  notified_goal_value numeric default -1,
  notified_goal_date text default '',
  updated_at timestamptz default now()
);

-- Row Level Security (RLS)
-- To keep this simple and compatible with direct client-side synchronization:
alter table public.users enable row level security;
alter table public.company_profile enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.goals enable row level security;

-- Simple permissive policies for the anonymous/authenticated role so that the local system can sync seamlessly:
create policy "Allow all actions for anon users on users" on public.users for all using (true) with check (true);
create policy "Allow all actions for anon users on company_profile" on public.company_profile for all using (true) with check (true);
create policy "Allow all actions for anon users on sales" on public.sales for all using (true) with check (true);
create policy "Allow all actions for anon users on expenses" on public.expenses for all using (true) with check (true);
create policy "Allow all actions for anon users on goals" on public.goals for all using (true) with check (true);
