begin;
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(trim(name)) > 0),
  address text not null default '', address_link text not null default '', photo text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index stores_owner_idx on public.stores(owner_id);
create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  nama_barang text not null check (length(trim(nama_barang)) > 0), brand text not null,
  harga numeric(16,2) not null check (harga >= 0), stok integer not null check (stok >= 0),
  barcode text not null check (length(trim(barcode)) > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(store_id, barcode)
);
create index products_store_brand_idx on public.products(store_id, brand, id);
create table public.history (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  barcode text not null, tanggal timestamptz not null default now(),
  nama_barang text not null, brand text not null,
  kategori text not null check (kategori in ('masuk', 'keluar')),
  jumlah integer not null check (jumlah > 0), harga numeric(16,2) not null check (harga >= 0),
  keterangan text, oleh text, created_at timestamptz not null default now()
);
create index history_store_date_idx on public.history(store_id, tanggal desc, id);
create index history_product_idx on public.history(product_id);
create table public.inventory_requests (
  id uuid primary key, store_id uuid not null references public.stores(id) on delete cascade,
  payload jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create index inventory_requests_store_idx on public.inventory_requests(store_id);

alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.history enable row level security;
alter table public.inventory_requests enable row level security;
create policy stores_owner on public.stores for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy products_owner on public.products for all to authenticated
  using (exists(select 1 from public.stores s where s.id = store_id and s.owner_id = (select auth.uid())))
  with check (exists(select 1 from public.stores s where s.id = store_id and s.owner_id = (select auth.uid())));
create policy history_read on public.history for select to authenticated
  using (exists(select 1 from public.stores s where s.id = store_id and s.owner_id = (select auth.uid())));
-- Only the RPC may write history, stock edits, or idempotency records.
revoke all on public.stores, public.products, public.history, public.inventory_requests from anon, authenticated;
grant select, insert, delete on public.stores, public.products to authenticated;
grant update(name, address, address_link, photo) on public.stores to authenticated;
grant select on public.history to authenticated;

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger stores_updated before update on public.stores for each row execute function public.touch_updated_at();
create trigger products_updated before update on public.products for each row execute function public.touch_updated_at();
commit;
