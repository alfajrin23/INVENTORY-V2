-- INVENTORY-V2 production schema
-- PostgreSQL/Supabase: atomic stock mutation, idempotency, ownership RLS and explicit Data API grants.

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  address text not null default '',
  address_link text not null default '',
  photo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  nama_barang text not null check (char_length(btrim(nama_barang)) between 1 and 180),
  brand text not null default '',
  harga bigint not null default 0 check (harga >= 0),
  stok integer not null default 0 check (stok >= 0),
  barcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.transaction_requests (
  request_id uuid primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  category text not null check (category in ('masuk', 'keluar')),
  payload_fingerprint text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.transaction_requests(request_id) on delete restrict,
  product_id uuid references public.products(id) on delete set null,
  store_id uuid not null references public.stores(id) on delete cascade,
  barcode text,
  tanggal timestamptz not null default now(),
  nama_barang text not null,
  brand text not null default '',
  kategori text not null check (kategori in ('masuk', 'keluar')),
  jumlah integer not null check (jumlah > 0),
  harga bigint not null check (harga >= 0),
  keterangan text,
  oleh text,
  created_at timestamptz not null default now()
);

create index if not exists products_store_idx on public.products(store_id);
create index if not exists products_store_name_idx on public.products(store_id, lower(nama_barang));
create unique index if not exists products_store_barcode_unique
  on public.products(store_id, lower(nullif(btrim(barcode), '')))
  where nullif(btrim(barcode), '') is not null;
create index if not exists history_store_date_idx on public.history(store_id, tanggal desc);
create index if not exists history_product_date_idx on public.history(product_id, tanggal desc);
create unique index if not exists history_request_product_unique
  on public.history(request_id, product_id)
  where request_id is not null and product_id is not null;

alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.history enable row level security;
alter table public.transaction_requests enable row level security;

-- Explicit grants are required for new Supabase projects where public tables are not auto-exposed.
revoke all on public.stores, public.products, public.history, public.transaction_requests from anon;
revoke all on public.stores, public.products, public.history, public.transaction_requests from authenticated;
grant select, insert, update, delete on public.stores to authenticated;
-- Direct product UPDATE is deliberately not exposed. Product edits and stock corrections use the guarded RPC.
grant select, insert, delete on public.products to authenticated;
grant select on public.history to authenticated;

create policy "stores_select_owner" on public.stores
for select to authenticated
using ((select auth.uid()) = owner_id);

create policy "stores_insert_owner" on public.stores
for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "stores_update_owner" on public.stores
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy "stores_delete_owner" on public.stores
for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy "products_select_store_owner" on public.products
for select to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid())
  )
);

create policy "products_insert_store_owner" on public.products
for insert to authenticated
with check (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid())
  )
);

create policy "products_update_store_owner" on public.products
for update to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid())
  )
);

create policy "products_delete_store_owner" on public.products
for delete to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = products.store_id and s.owner_id = (select auth.uid())
  )
);

create policy "history_select_store_owner" on public.history
for select to authenticated
using (
  exists (
    select 1 from public.stores s
    where s.id = history.store_id and s.owner_id = (select auth.uid())
  )
);

create or replace function public.update_inventory_product(
  p_product_id uuid,
  p_store_id uuid,
  p_name text,
  p_brand text,
  p_price bigint,
  p_stock integer,
  p_barcode text,
  p_expected_stock integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_product public.products%rowtype;
  v_delta integer;
  v_history public.history%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_price < 0 or p_stock < 0 then raise exception 'Harga dan stok tidak boleh negatif' using errcode = '22023'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Nama barang wajib diisi' using errcode = '22023'; end if;

  select p.* into v_product
  from public.products p
  join public.stores s on s.id = p.store_id
  where p.id = p_product_id and p.store_id = p_store_id and s.owner_id = v_uid
  for update of p;

  if not found then raise exception 'Produk tidak ditemukan atau bukan milik toko aktif' using errcode = '42501'; end if;
  if v_product.stok <> p_expected_stock then raise exception 'Stok berubah. Muat ulang produk sebelum mengedit.' using errcode = '40001'; end if;

  v_delta := p_stock - v_product.stok;
  update public.products
  set nama_barang = btrim(p_name), brand = btrim(coalesce(p_brand, '')), harga = p_price,
      stok = p_stock, barcode = nullif(btrim(coalesce(p_barcode, '')), ''), updated_at = now()
  where id = p_product_id
  returning * into v_product;

  if v_delta <> 0 then
    insert into public.history(product_id, store_id, barcode, tanggal, nama_barang, brand, kategori, jumlah, harga, keterangan, oleh)
    values (
      v_product.id, v_product.store_id, v_product.barcode, now(), v_product.nama_barang, v_product.brand,
      case when v_delta > 0 then 'masuk' else 'keluar' end,
      abs(v_delta), v_product.harga, 'Koreksi stok melalui edit produk', 'Admin'
    )
    returning * into v_history;
  end if;

  return jsonb_build_object(
    'products', jsonb_build_array(to_jsonb(v_product)),
    'history', case when v_delta <> 0 then jsonb_build_array(to_jsonb(v_history)) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.process_inventory_transaction(
  p_request_id uuid,
  p_store_id uuid,
  p_category text,
  p_items jsonb,
  p_note text default null,
  p_operator text default null,
  p_date timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_fingerprint text;
  v_existing_fingerprint text;
  v_canonical_items text;
  v_inserted integer;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_product public.products%rowtype;
  v_next_stock integer;
begin
  if v_uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'requestId wajib diisi' using errcode = '22023'; end if;
  if p_category not in ('masuk', 'keluar') then raise exception 'Jenis transaksi tidak valid' using errcode = '22023'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Item transaksi harus berjumlah 1 sampai 100' using errcode = '22023';
  end if;
  if not exists (select 1 from public.stores s where s.id = p_store_id and s.owner_id = v_uid) then
    raise exception 'Toko tidak ditemukan atau tidak dapat diakses' using errcode = '42501';
  end if;
  if (
    select count(*) <> count(distinct element->>'product_id')
    from jsonb_array_elements(p_items) element
  ) then
    raise exception 'Produk duplikat dalam satu transaksi tidak diperbolehkan' using errcode = '22023';
  end if;

  -- Make retries stable even if the client reconstructed the same cart in a different item order.
  select coalesce(jsonb_agg(element order by element->>'product_id'), '[]'::jsonb)::text
  into v_canonical_items
  from jsonb_array_elements(p_items) element;

  v_fingerprint := md5(
    p_store_id::text || '|' || p_category || '|' || v_canonical_items || '|' ||
    coalesce(p_note, '') || '|' || coalesce(p_operator, '') || '|' || coalesce(p_date::text, '')
  );

  insert into public.transaction_requests(request_id, store_id, category, payload_fingerprint)
  values (p_request_id, p_store_id, p_category, v_fingerprint)
  on conflict (request_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    select payload_fingerprint into v_existing_fingerprint
    from public.transaction_requests
    where request_id = p_request_id;

    if v_existing_fingerprint is distinct from v_fingerprint then
      raise exception 'requestId sudah digunakan untuk payload yang berbeda' using errcode = '22023';
    end if;

    return jsonb_build_object(
      'products', coalesce((
        select jsonb_agg(to_jsonb(p) order by p.nama_barang)
        from public.products p
        where exists (
          select 1 from public.history h where h.request_id = p_request_id and h.product_id = p.id
        )
      ), '[]'::jsonb),
      'history', coalesce((
        select jsonb_agg(to_jsonb(h) order by h.tanggal desc, h.id)
        from public.history h where h.request_id = p_request_id
      ), '[]'::jsonb)
    );
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin
      v_product_id := (v_item->>'product_id')::uuid;
      v_quantity := (v_item->>'quantity')::integer;
    exception when others then
      raise exception 'Format item transaksi tidak valid' using errcode = '22023';
    end;

    if v_quantity <= 0 or v_quantity > 1000000 then
      raise exception 'Jumlah harus bilangan bulat 1 sampai 1000000' using errcode = '22023';
    end if;

    select p.* into v_product
    from public.products p
    join public.stores s on s.id = p.store_id
    where p.id = v_product_id and p.store_id = p_store_id and s.owner_id = v_uid
    for update of p;

    if not found then raise exception 'Produk tidak ditemukan pada toko aktif' using errcode = '42501'; end if;

    v_next_stock := case when p_category = 'keluar' then v_product.stok - v_quantity else v_product.stok + v_quantity end;
    if v_next_stock < 0 then
      raise exception 'Stok % tidak cukup', v_product.nama_barang using errcode = '23514';
    end if;

    update public.products
    set stok = v_next_stock, updated_at = now()
    where id = v_product.id;

    insert into public.history(
      request_id, product_id, store_id, barcode, tanggal, nama_barang, brand,
      kategori, jumlah, harga, keterangan, oleh
    ) values (
      p_request_id, v_product.id, v_product.store_id, v_product.barcode, coalesce(p_date, now()),
      v_product.nama_barang, v_product.brand, p_category, v_quantity, v_product.harga,
      coalesce(nullif(btrim(p_note), ''), case when p_category = 'keluar' then 'Penjualan' else 'Restock' end),
      coalesce(nullif(btrim(p_operator), ''), 'Kasir')
    );
  end loop;

  return jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.nama_barang)
      from public.products p
      where exists (
        select 1 from public.history h where h.request_id = p_request_id and h.product_id = p.id
      )
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(to_jsonb(h) order by h.tanggal desc, h.id)
      from public.history h where h.request_id = p_request_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.update_inventory_product(uuid, uuid, text, text, bigint, integer, text, integer) from public, anon;
revoke all on function public.process_inventory_transaction(uuid, uuid, text, jsonb, text, text, timestamptz) from public, anon;
grant execute on function public.update_inventory_product(uuid, uuid, text, text, bigint, integer, text, integer) to authenticated;
grant execute on function public.process_inventory_transaction(uuid, uuid, text, jsonb, text, text, timestamptz) to authenticated;
