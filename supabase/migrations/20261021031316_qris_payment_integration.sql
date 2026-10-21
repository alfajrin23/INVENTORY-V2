begin;

alter table public.app_branding
  add column if not exists qris_image_url text;
grant update (qris_image_url) on public.app_branding to authenticated;

create table public.qris_payments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  client_request_id uuid not null unique,
  order_id text not null unique,
  transaction_id text unique,
  gross_amount numeric(14,0) not null check (gross_amount > 0 and gross_amount <= 999999999),
  cart_snapshot jsonb not null check (jsonb_typeof(cart_snapshot->'items') = 'array'),
  qris_string text,
  status text not null default 'creating'
    check (status in ('creating','pending','paid','expired','failed','inventory_error')),
  provider_status text,
  failure_reason text,
  inventory_result jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);

create index qris_payments_store_created_idx
  on public.qris_payments(store_id, created_at desc);
create index qris_payments_reservation_idx
  on public.qris_payments(store_id, status, expires_at);

alter table public.qris_payments enable row level security;
revoke all on public.qris_payments from public, anon, authenticated;
grant select (id, store_id, created_by, client_request_id, order_id, transaction_id,
  gross_amount, status, provider_status, failure_reason, inventory_result,
  created_at, expires_at, paid_at) on public.qris_payments to authenticated;
grant all on public.qris_payments to service_role;

create policy qris_payments_read_store_owner
  on public.qris_payments for select to authenticated
  using (exists (
    select 1 from public.stores s
    where s.id = qris_payments.store_id and s.owner_id = (select auth.uid())
  ));

create or replace function public.create_qris_payment_record(
  p_store_id uuid,
  p_created_by uuid,
  p_client_request_id uuid,
  p_order_id text,
  p_expected_amount numeric,
  p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item record;
  v_product public.products;
  v_store public.stores;
  v_snapshot jsonb := '[]'::jsonb;
  v_amount numeric := 0;
  v_reserved bigint;
  v_payment public.qris_payments;
begin
  if p_store_id is null or p_created_by is null or p_client_request_id is null
     or p_order_id is null or length(p_order_id) > 50
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Data pembayaran QRIS tidak valid';
  end if;

  -- This lock serializes new QR reservations with cash sales and stock edits.
  select * into v_store from public.stores
    where id = p_store_id and owner_id = p_created_by for update;
  if not found then raise exception 'Toko tidak ditemukan atau akses ditolak' using errcode = '42501'; end if;

  for v_item in
    select (value->>'productId')::uuid as id,
      sum((value->>'quantity')::integer)::bigint as quantity
    from jsonb_array_elements(p_items)
    group by 1 order by 1
  loop
    if v_item.quantity < 1 or v_item.quantity > 1000000 then
      raise exception 'Jumlah barang harus bilangan bulat 1 sampai 1000000';
    end if;
    select * into v_product from public.products
      where id = v_item.id and store_id = p_store_id for update;
    if not found then raise exception 'Produk tidak ditemukan di toko aktif'; end if;
    if v_product.harga < 0 or trunc(v_product.harga) <> v_product.harga then
      raise exception 'Harga produk harus berupa rupiah bulat';
    end if;

    select coalesce(sum((reserved_item.value->>'quantity')::bigint), 0) into v_reserved
    from public.qris_payments reserved
    cross join lateral jsonb_array_elements(reserved.cart_snapshot->'items') reserved_item(value)
    where reserved.store_id = p_store_id
      and reserved.status in ('creating','pending')
      and reserved.expires_at > now()
      and (reserved_item.value->>'productId')::uuid = v_product.id;
    if v_product.stok - v_reserved < v_item.quantity then
      raise exception 'Stok % tidak cukup untuk transaksi ini (tersedia % termasuk QRIS menunggu)',
        v_product.nama_barang, greatest(v_product.stok - v_reserved, 0);
    end if;

    v_amount := v_amount + v_product.harga * v_item.quantity;
    v_snapshot := v_snapshot || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id,
      'quantity', v_item.quantity,
      'unitPrice', v_product.harga,
      'namaBarang', v_product.nama_barang,
      'brand', v_product.brand,
      'barcode', v_product.barcode
    ));
  end loop;

  if v_amount <= 0 or v_amount > 999999999 or trunc(v_amount) <> v_amount
     or v_amount <> p_expected_amount then
    raise exception 'Total pembayaran berubah. Periksa ulang keranjang.';
  end if;

  insert into public.qris_payments(
    store_id, created_by, client_request_id, order_id, gross_amount,
    cart_snapshot, expires_at
  ) values (
    p_store_id, p_created_by, p_client_request_id, p_order_id, v_amount,
    jsonb_build_object('items', v_snapshot), now() + interval '15 minutes'
  ) returning * into v_payment;

  return jsonb_build_object(
    'id', v_payment.id, 'store_id', v_payment.store_id,
    'order_id', v_payment.order_id, 'gross_amount', v_payment.gross_amount,
    'cart_snapshot', v_payment.cart_snapshot, 'expires_at', v_payment.expires_at
  );
end;
$$;
revoke all on function public.create_qris_payment_record(uuid,uuid,uuid,text,numeric,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_qris_payment_record(uuid,uuid,uuid,text,numeric,jsonb)
  to service_role;

create or replace function public.prevent_qris_reserved_stock_sale()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_reserved bigint;
  v_settling_id uuid := nullif(current_setting('app.settling_qris_payment', true), '')::uuid;
begin
  if new.stok >= old.stok then return new; end if;

  select coalesce(sum((reserved_item.value->>'quantity')::bigint), 0) into v_reserved
  from public.qris_payments reserved
  cross join lateral jsonb_array_elements(reserved.cart_snapshot->'items') reserved_item(value)
  where reserved.store_id = old.store_id
    and reserved.status in ('creating','pending')
    and reserved.expires_at > now()
    and (reserved_item.value->>'productId')::uuid = old.id
    and (v_settling_id is null or reserved.id <> v_settling_id);

  if new.stok < v_reserved then
    raise exception 'Stok ditahan untuk QRIS yang masih menunggu pembayaran';
  end if;
  return new;
end;
$$;

create trigger prevent_qris_reserved_stock_sale
  before update of stok on public.products
  for each row execute function public.prevent_qris_reserved_stock_sale();

create or replace function public.settle_qris_payment(
  p_order_id text,
  p_transaction_id text,
  p_amount numeric
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.qris_payments;
  v_item record;
  v_product public.products;
  v_history public.history;
  v_histories jsonb := '[]'::jsonb;
  v_products jsonb := '[]'::jsonb;
  v_result jsonb;
  v_amount numeric := 0;
begin
  select * into v_payment from public.qris_payments
    where order_id = p_order_id for update;
  if not found then raise exception 'Pembayaran QRIS tidak ditemukan'; end if;
  if p_amount is null or p_amount <> v_payment.gross_amount then
    raise exception 'Nominal notifikasi QRIS tidak sesuai';
  end if;
  if v_payment.status = 'paid' then
    return jsonb_build_object('status', 'paid', 'duplicate', true);
  end if;
  if v_payment.status not in ('creating','pending','expired','inventory_error') then
    raise exception 'Status pembayaran QRIS tidak dapat diselesaikan';
  end if;
  if p_transaction_id is null or p_transaction_id = '' then
    raise exception 'ID transaksi dari Midtrans tidak valid';
  end if;

  perform 1 from public.stores where id = v_payment.store_id for update;
  if not found then raise exception 'Toko transaksi QRIS tidak ditemukan'; end if;

  for v_item in
    select (value->>'productId')::uuid as id,
      sum((value->>'quantity')::integer)::bigint as quantity,
      sum((value->>'unitPrice')::numeric * (value->>'quantity')::integer) as line_total
    from jsonb_array_elements(v_payment.cart_snapshot->'items')
    group by 1 order by 1
  loop
    if v_item.quantity < 1 or v_item.quantity > 1000000 then
      raise exception 'Snapshot jumlah produk QRIS tidak valid';
    end if;
    v_amount := v_amount + v_item.line_total;
    select * into v_product from public.products
      where id = v_item.id and store_id = v_payment.store_id for update;
    if not found then raise exception 'Produk QRIS tidak ditemukan di toko asal'; end if;
    if v_product.stok < v_item.quantity then
      raise exception 'Stok % tidak cukup saat QRIS terkonfirmasi', v_product.nama_barang;
    end if;

    -- Free this order's own reservation while keeping other pending QR orders protected.
    perform set_config('app.settling_qris_payment', v_payment.id::text, true);
    update public.products set stok = stok - v_item.quantity
      where id = v_product.id returning * into v_product;
    insert into public.history(
      store_id, product_id, barcode, tanggal, nama_barang, brand,
      kategori, jumlah, harga, keterangan, oleh
    ) values (
      v_payment.store_id, v_product.id,
      (select value->>'barcode' from jsonb_array_elements(v_payment.cart_snapshot->'items')
       where (value->>'productId')::uuid = v_product.id limit 1),
      now(),
      (select value->>'namaBarang' from jsonb_array_elements(v_payment.cart_snapshot->'items')
       where (value->>'productId')::uuid = v_product.id limit 1),
      (select value->>'brand' from jsonb_array_elements(v_payment.cart_snapshot->'items')
       where (value->>'productId')::uuid = v_product.id limit 1),
      'keluar', v_item.quantity,
      (select (value->>'unitPrice')::numeric from jsonb_array_elements(v_payment.cart_snapshot->'items')
       where (value->>'productId')::uuid = v_product.id limit 1),
      'Penjualan QRIS Midtrans ' || v_payment.order_id, 'Kasir'
    ) returning * into v_history;
    v_products := v_products || jsonb_build_array(to_jsonb(v_product));
    v_histories := v_histories || jsonb_build_array(to_jsonb(v_history));
  end loop;

  if v_amount <> v_payment.gross_amount then
    raise exception 'Total snapshot QRIS tidak sesuai dengan nominal pembayaran';
  end if;

  v_result := jsonb_build_object('products', v_products, 'history', v_histories);
  insert into public.inventory_requests(id, store_id, payload, result)
  values (
    v_payment.id, v_payment.store_id,
    jsonb_build_object('category','keluar','items',v_payment.cart_snapshot->'items',
      'note','Penjualan QRIS Midtrans ' || v_payment.order_id,'operator','Kasir'),
    v_result
  );

  update public.qris_payments set
    status = 'paid', provider_status = 'settlement', transaction_id = p_transaction_id,
    paid_at = now(), failure_reason = null, inventory_result = v_result
  where id = v_payment.id;
  return jsonb_build_object('status','paid','duplicate',false,'result',v_result);
end;
$$;
revoke all on function public.settle_qris_payment(text,text,numeric)
  from public, anon, authenticated;
grant execute on function public.settle_qris_payment(text,text,numeric)
  to service_role;

do $$
begin
  if to_regclass('pg_catalog.pg_publication') is not null
     and exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'qris_payments'
     ) then
    alter publication supabase_realtime add table public.qris_payments;
  end if;
end;
$$;

commit;
