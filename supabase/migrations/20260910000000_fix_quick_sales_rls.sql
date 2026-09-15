-- Ensure authenticated and anon users have full access to quick_sales
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'quick_sales' and policyname = 'Allow all actions for authenticated users on quick_sales'
  ) then
    create policy "Allow all actions for authenticated users on quick_sales" on public.quick_sales for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'quick_sales' and policyname = 'Allow all actions for anon users on quick_sales'
  ) then
    create policy "Allow all actions for anon users on quick_sales" on public.quick_sales for all to anon using (true) with check (true);
  end if;
end $$;
