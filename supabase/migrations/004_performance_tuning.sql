begin;

-- Hot read path: active-store product list ordered by id.
create index if not exists products_store_id_id_idx
  on public.products(store_id, id);

-- Report/history path: store + transaction category + newest rows first.
create index if not exists history_store_category_date_idx
  on public.history(store_id, kategori, tanggal desc, id);

-- Settings > Logs Input reads the newest activity for the active store.
create index if not exists audit_logs_store_created_idx
  on public.audit_logs(store_id, created_at desc, id);

-- Avoid a correlated store lookup for every candidate product/history row.
-- Supabase recommends indexing policy filter columns and using set-based filters where possible.
drop policy if exists products_owner on public.products;
create policy products_owner on public.products for all to authenticated
  using (
    store_id in (
      select s.id
      from public.stores s
      where s.owner_id = (select auth.uid())
    )
  )
  with check (
    store_id in (
      select s.id
      from public.stores s
      where s.owner_id = (select auth.uid())
    )
  );

drop policy if exists history_read on public.history;
create policy history_read on public.history for select to authenticated
  using (
    store_id in (
      select s.id
      from public.stores s
      where s.owner_id = (select auth.uid())
    )
  );

analyze public.stores;
analyze public.products;
analyze public.history;

commit;
