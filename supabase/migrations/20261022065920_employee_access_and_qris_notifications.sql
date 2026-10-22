begin;

create table public.store_memberships (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (length(trim(email)) > 3),
  role text not null check (role in ('manager', 'cashier')),
  active boolean not null default true,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create unique index store_memberships_store_email_idx on public.store_memberships(store_id, lower(email));
create index store_memberships_user_idx on public.store_memberships(user_id, active);
create trigger store_memberships_updated before update on public.store_memberships
  for each row execute function public.touch_updated_at();

alter table public.store_memberships enable row level security;
revoke all on public.store_memberships from public, anon, authenticated;
grant select on public.store_memberships to authenticated;
grant all on public.store_memberships to service_role;

create or replace function public.current_store_role(p_store_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when (select auth.uid()) is null then null
    when exists (
      select 1 from public.stores s
      where s.id = p_store_id and s.owner_id = (select auth.uid())
    ) then 'owner'
    else (
      select m.role from public.store_memberships m
      where m.store_id = p_store_id and m.user_id = (select auth.uid()) and m.active
      limit 1
    )
  end
$$;
revoke all on function public.current_store_role(uuid) from public, anon;
grant execute on function public.current_store_role(uuid) to authenticated;

create or replace function public.current_user_is_store_employee()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.store_memberships m
    where m.user_id = (select auth.uid()) and m.active)
$$;
revoke all on function public.current_user_is_store_employee() from public, anon;
grant execute on function public.current_user_is_store_employee() to authenticated;

create or replace function public.current_user_can_create_store()
returns boolean language sql stable security definer set search_path = '' as $$
  select not public.current_user_is_store_employee()
    or exists (select 1 from public.stores s where s.owner_id = (select auth.uid()))
$$;
revoke all on function public.current_user_can_create_store() from public, anon;
grant execute on function public.current_user_can_create_store() to authenticated;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
create or replace function private.user_store_role(p_store_id uuid, p_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_user_id is null then null
    when exists (select 1 from public.stores s where s.id = p_store_id and s.owner_id = p_user_id) then 'owner'
    else (select m.role from public.store_memberships m
      where m.store_id = p_store_id and m.user_id = p_user_id and m.active limit 1)
  end
$$;
revoke all on function private.user_store_role(uuid, uuid) from public, anon, authenticated;
grant execute on function private.user_store_role(uuid, uuid) to service_role;

create policy store_memberships_read on public.store_memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.current_store_role(store_id) in ('owner', 'manager'));

drop policy if exists stores_owner on public.stores;
create policy stores_member_read on public.stores for select to authenticated
  using (public.current_store_role(id) is not null);
create policy stores_owner_insert on public.stores for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.current_user_can_create_store());
create policy stores_owner_manager_update on public.stores for update to authenticated
  using (public.current_store_role(id) in ('owner', 'manager'))
  with check (public.current_store_role(id) in ('owner', 'manager'));
create policy stores_owner_manager_delete on public.stores for delete to authenticated
  using (public.current_store_role(id) in ('owner', 'manager'));

drop policy if exists products_owner on public.products;
create policy products_member_read on public.products for select to authenticated
  using (public.current_store_role(store_id) is not null);
create policy products_owner_manager_insert on public.products for insert to authenticated
  with check (public.current_store_role(store_id) in ('owner', 'manager'));
create policy products_owner_manager_update on public.products for update to authenticated
  using (public.current_store_role(store_id) in ('owner', 'manager'))
  with check (public.current_store_role(store_id) in ('owner', 'manager'));
create policy products_owner_manager_delete on public.products for delete to authenticated
  using (public.current_store_role(store_id) in ('owner', 'manager'));

drop policy if exists history_read on public.history;
create policy history_owner_manager_read on public.history for select to authenticated
  using (public.current_store_role(store_id) in ('owner', 'manager'));

drop policy if exists qris_payments_read_store_owner on public.qris_payments;
create policy qris_payments_read_store_staff on public.qris_payments for select to authenticated
  using (public.current_store_role(store_id) in ('owner', 'manager')
    or (public.current_store_role(store_id) = 'cashier' and created_by = (select auth.uid())));

drop policy if exists audit_logs_owner on public.audit_logs;
create policy audit_logs_owner_manager_read on public.audit_logs for select to authenticated
  using (public.current_store_role(store_id) in ('owner', 'manager'));
alter table public.audit_logs add column if not exists actor_name text;

create or replace function public.audit_inventory_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
  v_store_id uuid;
  v_record_id uuid;
  v_actor_id uuid;
  v_actor_name text;
  v_before jsonb;
  v_after jsonb;
  v_entity text;
begin
  if tg_op <> 'INSERT' then v_before := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_after := to_jsonb(new); end if;
  if tg_table_name = 'stores' then
    v_entity := 'store';
    v_store_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
    v_owner_id := coalesce((v_after->>'owner_id')::uuid, (v_before->>'owner_id')::uuid);
    v_before := v_before - 'photo';
    v_after := v_after - 'photo';
  else
    v_entity := case tg_table_name when 'products' then 'product' else 'transaction' end;
    v_store_id := coalesce((v_after->>'store_id')::uuid, (v_before->>'store_id')::uuid);
    select owner_id into v_owner_id from public.stores where id = v_store_id;
    v_owner_id := coalesce(v_owner_id, auth.uid());
  end if;
  v_record_id := coalesce((v_after->>'id')::uuid, (v_before->>'id')::uuid);
  v_actor_id := coalesce(nullif(current_setting('app.audit_actor_id', true), '')::uuid, auth.uid());
  select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, v_actor_id::text)
    into v_actor_name from auth.users u where u.id = v_actor_id;
  if v_actor_name is null then v_actor_name := case when v_actor_id is null then 'Sistem' else v_actor_id::text end; end if;
  if v_owner_id is not null then
    insert into public.audit_logs(owner_id,store_id,actor_id,actor_name,entity,action,record_id,before_data,after_data)
    values(v_owner_id,v_store_id,v_actor_id,v_actor_name,v_entity,lower(tg_op),v_record_id,v_before,v_after);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_inventory_change() from public, anon, authenticated;

create or replace function public.process_inventory_transaction(
  p_store_id uuid, p_request_id uuid, p_category text, p_items jsonb,
  p_note text default null, p_operator text default null, p_date timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item record; v_product public.products; v_history public.history;
  v_payload jsonb; v_previous public.inventory_requests;
  v_products jsonb := '[]'; v_histories jsonb := '[]'; v_result jsonb;
  v_role text; v_actor_name text;
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu' using errcode = '42501'; end if;
  v_role := public.current_store_role(p_store_id);
  if v_role is null then raise exception 'Toko tidak ditemukan atau akses ditolak' using errcode = '42501'; end if;
  if v_role = 'cashier' and p_category <> 'keluar' then
    raise exception 'Kasir hanya dapat mencatat barang keluar' using errcode = '42501';
  end if;
  select coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), u.email, auth.uid()::text)
    into v_actor_name from auth.users u where u.id = auth.uid();
  v_actor_name := coalesce(v_actor_name, auth.uid()::text);
  perform 1 from public.stores where id = p_store_id for update;
  if p_request_id is null or p_category is null or p_category not in ('masuk','keluar') then raise exception 'Jenis transaksi atau ID permintaan tidak valid'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Item tidak valid'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then raise exception 'Isi 1 sampai 100 item'; end if;
  v_payload := jsonb_build_object('category',p_category,'items',p_items,'note',p_note,'operator',v_actor_name,'date',p_date);
  select * into v_previous from public.inventory_requests where id = p_request_id;
  if found then
    if v_previous.store_id <> p_store_id or v_previous.payload->'items' <> p_items
       or v_previous.payload->>'category' <> p_category then raise exception 'ID permintaan sudah digunakan'; end if;
    return jsonb_set(v_previous.result, '{products}', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.id) from public.products p
      where p.store_id = p_store_id and p.id in (
        select (value->>'productId')::uuid from jsonb_array_elements(p_items)
      )
    ), '[]'::jsonb));
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item.value->'quantity') is distinct from 'number'
       or (v_item.value->>'quantity')::numeric <= 0
       or (v_item.value->>'quantity')::numeric > 1000000
       or trunc((v_item.value->>'quantity')::numeric) <> (v_item.value->>'quantity')::numeric
       or v_item.value->>'productId' is null then raise exception 'Jumlah harus bilangan bulat 1 sampai 1000000'; end if;
  end loop;
  for v_item in select (value->>'productId')::uuid as id, sum((value->>'quantity')::integer)::bigint as qty
    from jsonb_array_elements(p_items) group by 1 order by 1 loop
    if v_item.qty > 1000000 then raise exception 'Jumlah terlalu besar'; end if;
    select * into v_product from public.products where id = v_item.id and store_id = p_store_id for update;
    if not found then raise exception 'Produk tidak ditemukan di toko aktif'; end if;
    if p_category = 'keluar' and v_product.stok < v_item.qty then raise exception 'Stok % tidak cukup (tersedia %)', v_product.nama_barang, v_product.stok; end if;
    update public.products set stok = stok + case when p_category = 'keluar' then -v_item.qty else v_item.qty end
      where id = v_product.id returning * into v_product;
    perform set_config('app.audit_actor_id', auth.uid()::text, true);
    insert into public.history(store_id,product_id,barcode,tanggal,nama_barang,brand,kategori,jumlah,harga,keterangan,oleh)
      values(p_store_id,v_product.id,v_product.barcode,coalesce(p_date,now()),v_product.nama_barang,v_product.brand,
        p_category,v_item.qty,v_product.harga,coalesce(p_note,case when p_category='keluar' then 'Penjualan' else 'Restock' end),v_actor_name)
      returning * into v_history;
    v_products := v_products || jsonb_build_array(to_jsonb(v_product));
    v_histories := v_histories || jsonb_build_array(to_jsonb(v_history));
  end loop;
  v_result := jsonb_build_object('products',v_products,'history',v_histories);
  insert into public.inventory_requests(id,store_id,payload,result) values(p_request_id,p_store_id,v_payload,v_result);
  return v_result;
end;
$$;
revoke all on function public.process_inventory_transaction(uuid,uuid,text,jsonb,text,text,timestamptz) from public, anon;
grant execute on function public.process_inventory_transaction(uuid,uuid,text,jsonb,text,text,timestamptz) to authenticated;

create or replace function public.update_inventory_product(p_id uuid, p_store_id uuid, p_expected_stock integer, p_product jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.products; v_new public.products; v_history public.history; v_delta integer; v_actor_name text;
begin
  if public.current_store_role(p_store_id) not in ('owner','manager') then raise exception 'Akses toko ditolak' using errcode='42501'; end if;
  select coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,auth.uid()::text) into v_actor_name from auth.users u where u.id=auth.uid();
  v_actor_name:=coalesce(v_actor_name,auth.uid()::text);
  perform 1 from public.stores where id=p_store_id for update;
  select * into v_old from public.products where id=p_id and store_id=p_store_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if p_expected_stock is distinct from v_old.stok then raise exception 'Stok berubah. Muat ulang produk sebelum mengedit.'; end if;
  if (p_product->>'stok')::numeric <> trunc((p_product->>'stok')::numeric) then raise exception 'Stok harus bilangan bulat'; end if;
  v_delta := (p_product->>'stok')::integer - v_old.stok;
  update public.products set nama_barang=p_product->>'nama_barang',brand=p_product->>'brand',harga=(p_product->>'harga')::numeric,
    stok=(p_product->>'stok')::integer,barcode=p_product->>'barcode' where id=p_id returning * into v_new;
  if v_delta <> 0 then
    perform set_config('app.audit_actor_id',auth.uid()::text,true);
    insert into public.history(store_id,product_id,barcode,nama_barang,brand,kategori,jumlah,harga,keterangan,oleh)
    values(p_store_id,p_id,v_new.barcode,v_new.nama_barang,v_new.brand,case when v_delta>0 then 'masuk' else 'keluar' end,
      abs(v_delta),v_new.harga,'Koreksi stok melalui edit produk',v_actor_name) returning * into v_history;
  end if;
  return jsonb_build_object('products',jsonb_build_array(to_jsonb(v_new)),
    'history',case when v_delta<>0 then jsonb_build_array(to_jsonb(v_history)) else '[]'::jsonb end);
end;
$$;
revoke all on function public.update_inventory_product(uuid,uuid,integer,jsonb) from public, anon;
grant execute on function public.update_inventory_product(uuid,uuid,integer,jsonb) to authenticated;

create or replace function public.revise_inventory_transaction(
  p_store_id uuid, p_history_id uuid, p_expected_updated_at timestamptz,
  p_change jsonb, p_delete boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.history; v_history public.history; v_old_product public.products; v_new_product public.products;
  v_new_product_id uuid; v_category text; v_quantity numeric; v_price numeric; v_date timestamptz;
  v_note text; v_operator text; v_old_reversal bigint; v_new_effect bigint; v_old_stock bigint;
  v_new_stock bigint; v_products jsonb; v_actor_name text;
begin
  if auth.uid() is null or public.current_store_role(p_store_id) not in ('owner','manager') then
    raise exception 'Akses toko ditolak' using errcode='42501';
  end if;
  select coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,auth.uid()::text) into v_actor_name from auth.users u where u.id=auth.uid();
  v_actor_name:=coalesce(v_actor_name,auth.uid()::text);
  perform 1 from public.stores where id=p_store_id for update;
  select * into v_old from public.history where id=p_history_id and store_id=p_store_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan. Muat ulang data.'; end if;
  if p_expected_updated_at is distinct from v_old.updated_at then raise exception 'Transaksi sudah berubah. Muat ulang sebelum mengedit.'; end if;
  if v_old.product_id is null then raise exception 'Produk asal transaksi sudah dihapus. Stok tidak dapat dikoreksi otomatis.'; end if;
  select * into v_old_product from public.products where id=v_old.product_id and store_id=p_store_id for update;
  if not found then raise exception 'Produk asal transaksi tidak ditemukan.'; end if;
  v_old_reversal:=case when v_old.kategori='masuk' then -v_old.jumlah else v_old.jumlah end;
  if p_delete then
    v_old_stock:=v_old_product.stok::bigint+v_old_reversal;
    if v_old_stock<0 or v_old_stock>2147483647 then raise exception 'Stok tidak cukup untuk membatalkan transaksi ini.'; end if;
    update public.products set stok=v_old_stock where id=v_old_product.id returning * into v_old_product;
    delete from public.history where id=v_old.id;
    return jsonb_build_object('products',jsonb_build_array(to_jsonb(v_old_product)),'history','[]'::jsonb,'deletedId',v_old.id);
  end if;
  if p_change is null or jsonb_typeof(p_change)<>'object' then raise exception 'Perubahan transaksi tidak valid'; end if;
  v_new_product_id:=(p_change->>'productId')::uuid; v_category:=p_change->>'category';
  if v_category is null or v_category not in ('masuk','keluar') then raise exception 'Jenis transaksi tidak valid'; end if;
  if jsonb_typeof(p_change->'quantity') is distinct from 'number' then raise exception 'Jumlah harus bilangan bulat'; end if;
  v_quantity:=(p_change->>'quantity')::numeric;
  if v_quantity<1 or v_quantity>1000000 or trunc(v_quantity)<>v_quantity then raise exception 'Jumlah harus bilangan bulat 1 sampai 1000000'; end if;
  if jsonb_typeof(p_change->'price') is distinct from 'number' then raise exception 'Harga tidak valid'; end if;
  v_price:=(p_change->>'price')::numeric;
  if v_price<0 or v_price>99999999999999.99 then raise exception 'Harga tidak valid'; end if;
  v_date:=(p_change->>'date')::timestamptz; if v_date is null then raise exception 'Tanggal tidak valid'; end if;
  v_note:=p_change->>'note';
  if v_new_product_id is null then raise exception 'Pilih produk transaksi'; end if;
  select * into v_new_product from public.products where id=v_new_product_id and store_id=p_store_id for update;
  if not found then raise exception 'Produk baru tidak ditemukan di toko aktif'; end if;
  v_new_effect:=case when v_category='masuk' then v_quantity::bigint else -v_quantity::bigint end;
  v_old_stock:=v_old_product.stok::bigint+v_old_reversal;
  if v_new_product.id=v_old_product.id then
    v_old_stock:=v_old_stock+v_new_effect;
    if v_old_stock<0 or v_old_stock>2147483647 then raise exception 'Stok tidak cukup untuk perubahan ini'; end if;
    if v_old_stock<>v_old_product.stok then update public.products set stok=v_old_stock where id=v_old_product.id returning * into v_new_product; end if;
    v_products:=jsonb_build_array(to_jsonb(v_new_product));
  else
    v_new_stock:=v_new_product.stok::bigint+v_new_effect;
    if v_old_stock<0 or v_old_stock>2147483647 or v_new_stock<0 or v_new_stock>2147483647 then raise exception 'Stok tidak cukup untuk perubahan ini'; end if;
    update public.products set stok=v_old_stock where id=v_old_product.id returning * into v_old_product;
    update public.products set stok=v_new_stock where id=v_new_product.id returning * into v_new_product;
    v_products:=jsonb_build_array(to_jsonb(v_old_product),to_jsonb(v_new_product));
  end if;
  perform set_config('app.audit_actor_id',auth.uid()::text,true);
  update public.history set product_id=v_new_product.id,barcode=v_new_product.barcode,nama_barang=v_new_product.nama_barang,
    brand=v_new_product.brand,kategori=v_category,jumlah=v_quantity::integer,harga=v_price,tanggal=v_date,
    keterangan=v_note,oleh=v_actor_name where id=v_old.id returning * into v_history;
  return jsonb_build_object('products',v_products,'history',jsonb_build_array(to_jsonb(v_history)));
end;
$$;
revoke all on function public.revise_inventory_transaction(uuid,uuid,timestamptz,jsonb,boolean) from public, anon;
grant execute on function public.revise_inventory_transaction(uuid,uuid,timestamptz,jsonb,boolean) to authenticated;

create or replace function public.create_qris_payment_record(
  p_store_id uuid, p_created_by uuid, p_client_request_id uuid, p_order_id text,
  p_expected_amount numeric, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item record; v_product public.products; v_store public.stores; v_snapshot jsonb:='[]'::jsonb;
  v_amount numeric:=0; v_reserved bigint; v_payment public.qris_payments;
begin
  if p_store_id is null or p_created_by is null or p_client_request_id is null or p_order_id is null or length(p_order_id)>50
     or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then
    raise exception 'Data pembayaran QRIS tidak valid';
  end if;
  if private.user_store_role(p_store_id,p_created_by) not in ('owner','manager','cashier') then
    raise exception 'Toko tidak ditemukan atau akses ditolak' using errcode='42501';
  end if;
  select * into v_store from public.stores where id=p_store_id for update;
  if not found then raise exception 'Toko tidak ditemukan atau akses ditolak' using errcode='42501'; end if;
  for v_item in select (value->>'productId')::uuid as id,sum((value->>'quantity')::integer)::bigint as quantity
    from jsonb_array_elements(p_items) group by 1 order by 1 loop
    if v_item.quantity<1 or v_item.quantity>1000000 then raise exception 'Jumlah barang harus bilangan bulat 1 sampai 1000000'; end if;
    select * into v_product from public.products where id=v_item.id and store_id=p_store_id for update;
    if not found then raise exception 'Produk tidak ditemukan di toko aktif'; end if;
    if v_product.harga<0 or trunc(v_product.harga)<>v_product.harga then raise exception 'Harga produk harus berupa rupiah bulat'; end if;
    select coalesce(sum((reserved_item.value->>'quantity')::bigint),0) into v_reserved
      from public.qris_payments reserved cross join lateral jsonb_array_elements(reserved.cart_snapshot->'items') reserved_item(value)
      where reserved.store_id=p_store_id and reserved.status in ('creating','pending') and reserved.expires_at>now()
        and (reserved_item.value->>'productId')::uuid=v_product.id;
    if v_product.stok-v_reserved<v_item.quantity then raise exception 'Stok % tidak cukup untuk transaksi ini (tersedia % termasuk QRIS menunggu)',v_product.nama_barang,greatest(v_product.stok-v_reserved,0); end if;
    v_amount:=v_amount+v_product.harga*v_item.quantity;
    v_snapshot:=v_snapshot||jsonb_build_array(jsonb_build_object('productId',v_product.id,'quantity',v_item.quantity,
      'unitPrice',v_product.harga,'namaBarang',v_product.nama_barang,'brand',v_product.brand,'barcode',v_product.barcode));
  end loop;
  if v_amount<=0 or v_amount>999999999 or trunc(v_amount)<>v_amount or v_amount<>p_expected_amount then
    raise exception 'Total pembayaran berubah. Periksa ulang keranjang.';
  end if;
  insert into public.qris_payments(store_id,created_by,client_request_id,order_id,gross_amount,cart_snapshot,expires_at)
    values(p_store_id,p_created_by,p_client_request_id,p_order_id,v_amount,jsonb_build_object('items',v_snapshot),now()+interval '15 minutes')
    returning * into v_payment;
  return jsonb_build_object('id',v_payment.id,'store_id',v_payment.store_id,'order_id',v_payment.order_id,
    'gross_amount',v_payment.gross_amount,'cart_snapshot',v_payment.cart_snapshot,'expires_at',v_payment.expires_at);
end;
$$;
revoke all on function public.create_qris_payment_record(uuid,uuid,uuid,text,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.create_qris_payment_record(uuid,uuid,uuid,text,numeric,jsonb) to service_role;

alter table public.qris_payments add column if not exists confirmation_source text
  check (confirmation_source in ('manual','notification','provider'));
grant select (confirmation_source) on public.qris_payments to authenticated;
create table public.qris_notification_events (
  event_fingerprint text primary key check (event_fingerprint ~ '^[0-9a-f]{64}$'),
  payment_id uuid not null references public.qris_payments(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  source_package text not null,
  amount numeric(14,0) not null check (amount > 0),
  notification_at timestamptz not null,
  received_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.qris_notification_events enable row level security;
revoke all on public.qris_notification_events from public, anon, authenticated;
grant all on public.qris_notification_events to service_role;

create or replace function public.settle_qris_payment(p_order_id text,p_transaction_id text,p_amount numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.qris_payments; v_item record; v_product public.products; v_history public.history;
  v_histories jsonb:='[]'::jsonb; v_products jsonb:='[]'::jsonb; v_result jsonb; v_amount numeric:=0; v_actor_id uuid; v_actor_name text;
begin
  select * into v_payment from public.qris_payments where order_id=p_order_id for update;
  if not found then raise exception 'Pembayaran QRIS tidak ditemukan'; end if;
  if p_amount is null or p_amount<>v_payment.gross_amount then raise exception 'Nominal notifikasi QRIS tidak sesuai'; end if;
  if v_payment.status='paid' then return jsonb_build_object('status','paid','duplicate',true); end if;
  if v_payment.status not in ('creating','pending','expired','inventory_error') then raise exception 'Status pembayaran QRIS tidak dapat diselesaikan'; end if;
  if p_transaction_id is null or p_transaction_id='' then raise exception 'ID transaksi QRIS tidak valid'; end if;
  perform 1 from public.stores where id=v_payment.store_id for update;
  if not found then raise exception 'Toko transaksi QRIS tidak ditemukan'; end if;
  v_actor_id:=coalesce(nullif(current_setting('app.qris_confirmation_actor_id',true),'')::uuid,v_payment.created_by);
  perform set_config('app.audit_actor_id',coalesce(v_actor_id::text,''),true);
  select coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email,v_actor_id::text) into v_actor_name
    from auth.users u where u.id=v_actor_id;
  v_actor_name:=coalesce(v_actor_name,v_actor_id::text,'Sistem');
  for v_item in select (value->>'productId')::uuid as id,sum((value->>'quantity')::integer)::bigint as quantity,
      sum((value->>'unitPrice')::numeric*(value->>'quantity')::integer) as line_total
    from jsonb_array_elements(v_payment.cart_snapshot->'items') group by 1 order by 1 loop
    if v_item.quantity<1 or v_item.quantity>1000000 then raise exception 'Snapshot jumlah produk QRIS tidak valid'; end if;
    v_amount:=v_amount+v_item.line_total;
    select * into v_product from public.products where id=v_item.id and store_id=v_payment.store_id for update;
    if not found then raise exception 'Produk QRIS tidak ditemukan di toko asal'; end if;
    if v_product.stok<v_item.quantity then raise exception 'Stok % tidak cukup saat QRIS terkonfirmasi',v_product.nama_barang; end if;
    perform set_config('app.settling_qris_payment',v_payment.id::text,true);
    update public.products set stok=stok-v_item.quantity where id=v_product.id returning * into v_product;
    insert into public.history(store_id,product_id,barcode,tanggal,nama_barang,brand,kategori,jumlah,harga,keterangan,oleh)
      values(v_payment.store_id,v_product.id,
        (select value->>'barcode' from jsonb_array_elements(v_payment.cart_snapshot->'items') where (value->>'productId')::uuid=v_product.id limit 1),
        now(),(select value->>'namaBarang' from jsonb_array_elements(v_payment.cart_snapshot->'items') where (value->>'productId')::uuid=v_product.id limit 1),
        (select value->>'brand' from jsonb_array_elements(v_payment.cart_snapshot->'items') where (value->>'productId')::uuid=v_product.id limit 1),
        'keluar',v_item.quantity,(select (value->>'unitPrice')::numeric from jsonb_array_elements(v_payment.cart_snapshot->'items') where (value->>'productId')::uuid=v_product.id limit 1),
        'Penjualan QRIS '||v_payment.order_id,v_actor_name) returning * into v_history;
    v_products:=v_products||jsonb_build_array(to_jsonb(v_product)); v_histories:=v_histories||jsonb_build_array(to_jsonb(v_history));
  end loop;
  if v_amount<>v_payment.gross_amount then raise exception 'Total snapshot QRIS tidak sesuai dengan nominal pembayaran'; end if;
  v_result:=jsonb_build_object('products',v_products,'history',v_histories);
  insert into public.inventory_requests(id,store_id,payload,result) values(v_payment.id,v_payment.store_id,
    jsonb_build_object('category','keluar','items',v_payment.cart_snapshot->'items','note','Penjualan QRIS '||v_payment.order_id,'operator',v_actor_name),v_result);
  update public.qris_payments set status='paid',provider_status='settlement',transaction_id=p_transaction_id,paid_at=now(),
    failure_reason=null,inventory_result=v_result,confirmation_source='provider' where id=v_payment.id;
  return jsonb_build_object('status','paid','duplicate',false,'result',v_result);
end;
$$;
revoke all on function public.settle_qris_payment(text,text,numeric) from public, anon, authenticated;
grant execute on function public.settle_qris_payment(text,text,numeric) to service_role;

drop function if exists public.confirm_qris_payment(uuid);
create function public.confirm_qris_payment(
  p_payment_id uuid,
  p_confirmation_method text default 'manual',
  p_notification_amount numeric default null,
  p_source_package text default null,
  p_notification_at timestamptz default null,
  p_event_fingerprint text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.qris_payments; v_settlement jsonb; v_error text; v_manual_transaction_id text; v_matches integer;
begin
  if (select auth.uid()) is null then raise exception 'Sesi login tidak valid' using errcode='42501'; end if;
  select * into v_payment from public.qris_payments where id=p_payment_id for update;
  if not found then raise exception 'Transaksi QRIS tidak ditemukan'; end if;
  if public.current_store_role(v_payment.store_id) not in ('owner','manager')
     and not (public.current_store_role(v_payment.store_id)='cashier' and v_payment.created_by=(select auth.uid())) then
    raise exception 'Akses transaksi QRIS ditolak' using errcode='42501';
  end if;
  if v_payment.status='paid' then return jsonb_build_object('status','paid','duplicate',true); end if;
  if v_payment.status not in ('pending','expired','inventory_error') then raise exception 'Status transaksi QRIS tidak dapat dikonfirmasi'; end if;
  if p_confirmation_method not in ('manual','notification') then raise exception 'Metode konfirmasi QRIS tidak valid'; end if;
  if p_confirmation_method='notification' then
    if p_notification_amount is distinct from v_payment.gross_amount then raise exception 'Nominal notifikasi tidak sesuai dengan pembayaran QRIS'; end if;
    if p_source_package not in ('com.gojek.gopaymerchant','com.gojek.resto') then raise exception 'Notifikasi bukan dari aplikasi merchant GoPay yang didukung'; end if;
    if p_notification_at is null or v_payment.status<>'pending'
       or p_notification_at<v_payment.created_at or p_notification_at>v_payment.expires_at
       or p_notification_at>now()+interval '30 seconds' then raise exception 'Waktu notifikasi tidak cocok dengan pembayaran aktif'; end if;
    select count(*) into v_matches from public.qris_payments p
      where p.store_id=v_payment.store_id and p.gross_amount=v_payment.gross_amount and p.status='pending'
        and p.created_at<=p_notification_at and p.expires_at>=p_notification_at;
    if v_matches<>1 then raise exception 'Nominal sama dengan beberapa atau tidak ada pembayaran aktif; konfirmasi manual setelah cek GoBiz'; end if;
    if p_event_fingerprint is null or p_event_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'ID notifikasi tidak valid'; end if;
    insert into public.qris_notification_events(event_fingerprint,payment_id,store_id,source_package,amount,notification_at,received_by)
      values(p_event_fingerprint,v_payment.id,v_payment.store_id,p_source_package,p_notification_amount,p_notification_at,auth.uid())
      on conflict (event_fingerprint) do nothing;
    if not found then raise exception 'Notifikasi pembayaran ini sudah pernah dipakai'; end if;
  end if;
  v_manual_transaction_id:=case when p_confirmation_method='manual'
    then coalesce(v_payment.transaction_id,'MANUAL-'||v_payment.id::text)
    else 'NOTIFICATION-'||v_payment.id::text end;
  begin
    perform set_config('app.qris_confirmation_actor_id',(select auth.uid())::text,true);
    v_settlement:=public.settle_qris_payment(v_payment.order_id,v_manual_transaction_id,v_payment.gross_amount);
    update public.qris_payments set provider_status=case when p_confirmation_method='manual' then 'manual_confirmed' else 'notification_confirmed' end,
      confirmation_source=p_confirmation_method where id=v_payment.id;
    update public.history h set keterangan=replace(h.keterangan,'Penjualan QRIS Midtrans ','Penjualan QRIS ')
      where h.id in (select (history_row->>'id')::uuid from jsonb_array_elements(coalesce(v_settlement->'result'->'history','[]'::jsonb)) as history_rows(history_row) where history_row->>'id' is not null);
    update public.inventory_requests set payload=jsonb_set(payload,'{note}',to_jsonb('Penjualan QRIS '||v_payment.order_id),true) where id=v_payment.id;
    return jsonb_build_object('status','paid','duplicate',false,'confirmation_source',p_confirmation_method);
  exception when others then
    get stacked diagnostics v_error=message_text;
    update public.qris_payments set status='inventory_error',
      provider_status=case when p_confirmation_method='manual' then 'manual_confirmed' else 'notification_confirmed' end,
      confirmation_source=p_confirmation_method,transaction_id=v_manual_transaction_id,paid_at=coalesce(paid_at,now()),
      failure_reason=left('Dana dikonfirmasi, tetapi stok belum tersimpan: '||v_error,500) where id=v_payment.id;
    return jsonb_build_object('status','inventory_error','duplicate',false,'confirmation_source',p_confirmation_method,
      'message','Dana sudah dikonfirmasi, tetapi stok perlu ditinjau admin.');
  end;
end;
$$;
revoke all on function public.confirm_qris_payment(uuid,text,numeric,text,timestamptz,text) from public, anon;
grant execute on function public.confirm_qris_payment(uuid,text,numeric,text,timestamptz,text) to authenticated;

commit;
