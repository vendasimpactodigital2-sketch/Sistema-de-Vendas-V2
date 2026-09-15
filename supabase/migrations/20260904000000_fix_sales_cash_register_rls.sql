-- Ensure authenticated and anon users have full access to sales and cash register state
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'sales' and policyname = 'Allow all actions for authenticated users on sales'
  ) then
    create policy "Allow all actions for authenticated users on sales" on public.sales for all to authenticated using (true) with check (true);
  end if;
end $$;
