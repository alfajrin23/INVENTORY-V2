begin;

alter table public.history add column updated_at timestamptz not null default now();
create trigger history_updated before update on public.history for each row execute function public.touch_updated_at();

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null,
  actor_id uuid,
  entity text not null check (entity in ('store', 'product', 'transaction')),
  action text not null check (action in ('insert', 'update', 'delete')),
  record_id uuid not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_owner_store_date_idx on public.audit_logs(owner_id, store_id, created_at desc, id);
alter table public.audit_logs enable row level security;
create policy audit_logs_owner on public.audit_logs for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create function public.audit_inventory_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner_id uuid;
  v_store_id uuid;
  v_record_id uuid;
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
  if v_owner_id is not null then
    insert into public.audit_logs(owner_id,store_id,actor_id,entity,action,record_id,before_data,after_data)
    values(v_owner_id,v_store_id,auth.uid(),v_entity,lower(tg_op),v_record_id,v_before,v_after);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_inventory_change() from public, anon, authenticated;
create trigger stores_audit after insert or update or delete on public.stores
  for each row execute function public.audit_inventory_change();
create trigger products_audit after insert or update or delete on public.products
  for each row execute function public.audit_inventory_change();
create trigger history_audit after insert or update or delete on public.history
  for each row execute function public.audit_inventory_change();

create function public.revise_inventory_transaction(
  p_store_id uuid, p_history_id uuid, p_expected_updated_at timestamptz,
  p_change jsonb, p_delete boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.history;
  v_history public.history;
  v_old_product public.products;
  v_new_product public.products;
  v_new_product_id uuid;
  v_category text;
  v_quantity numeric;
  v_price numeric;
  v_date timestamptz;
  v_note text;
  v_operator text;
  v_old_reversal bigint;
  v_new_effect bigint;
  v_old_stock bigint;
  v_new_stock bigint;
  v_products jsonb;
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu' using errcode = '42501'; end if;
  perform 1 from public.stores where id = p_store_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Toko tidak ditemukan atau akses ditolak' using errcode = '42501'; end if;
  select * into v_old from public.history where id = p_history_id and store_id = p_store_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan. Muat ulang data.'; end if;
  if p_expected_updated_at is distinct from v_old.updated_at then
    raise exception 'Transaksi sudah berubah. Muat ulang sebelum mengedit.';
  end if;
  if v_old.product_id is null then
    raise exception 'Produk asal transaksi sudah dihapus. Stok tidak dapat dikoreksi otomatis.';
  end if;
  select * into v_old_product from public.products where id = v_old.product_id and store_id = p_store_id for update;
  if not found then raise exception 'Produk asal transaksi tidak ditemukan.'; end if;
  v_old_reversal := case when v_old.kategori = 'masuk' then -v_old.jumlah else v_old.jumlah end;

  if p_delete then
    v_old_stock := v_old_product.stok::bigint + v_old_reversal;
    if v_old_stock < 0 or v_old_stock > 2147483647 then
      raise exception 'Stok tidak cukup untuk membatalkan transaksi ini.';
    end if;
    update public.products set stok = v_old_stock where id = v_old_product.id returning * into v_old_product;
    delete from public.history where id = v_old.id;
    return jsonb_build_object('products',jsonb_build_array(to_jsonb(v_old_product)),
      'history','[]'::jsonb,'deletedId',v_old.id);
  end if;

  if p_change is null or jsonb_typeof(p_change) <> 'object' then raise exception 'Perubahan transaksi tidak valid'; end if;
  v_new_product_id := (p_change->>'productId')::uuid;
  v_category := p_change->>'category';
  if v_category is null or v_category not in ('masuk','keluar') then raise exception 'Jenis transaksi tidak valid'; end if;
  if jsonb_typeof(p_change->'quantity') is distinct from 'number' then raise exception 'Jumlah harus bilangan bulat'; end if;
  v_quantity := (p_change->>'quantity')::numeric;
  if v_quantity < 1 or v_quantity > 1000000 or trunc(v_quantity) <> v_quantity then
    raise exception 'Jumlah harus bilangan bulat 1 sampai 1000000';
  end if;
  if jsonb_typeof(p_change->'price') is distinct from 'number' then raise exception 'Harga tidak valid'; end if;
  v_price := (p_change->>'price')::numeric;
  if v_price < 0 or v_price > 99999999999999.99 then raise exception 'Harga tidak valid'; end if;
  v_date := (p_change->>'date')::timestamptz;
  if v_date is null then raise exception 'Tanggal tidak valid'; end if;
  v_note := p_change->>'note';
  v_operator := p_change->>'operator';
  if v_new_product_id is null then raise exception 'Pilih produk transaksi'; end if;
  select * into v_new_product from public.products where id = v_new_product_id and store_id = p_store_id for update;
  if not found then raise exception 'Produk baru tidak ditemukan di toko aktif'; end if;
  v_new_effect := case when v_category = 'masuk' then v_quantity::bigint else -v_quantity::bigint end;
  v_old_stock := v_old_product.stok::bigint + v_old_reversal;
  if v_new_product.id = v_old_product.id then
    v_old_stock := v_old_stock + v_new_effect;
    if v_old_stock < 0 or v_old_stock > 2147483647 then raise exception 'Stok tidak cukup untuk perubahan ini'; end if;
    if v_old_stock <> v_old_product.stok then
      update public.products set stok = v_old_stock where id = v_old_product.id returning * into v_new_product;
    end if;
    v_products := jsonb_build_array(to_jsonb(v_new_product));
  else
    v_new_stock := v_new_product.stok::bigint + v_new_effect;
    if v_old_stock < 0 or v_old_stock > 2147483647 or v_new_stock < 0 or v_new_stock > 2147483647 then
      raise exception 'Stok tidak cukup untuk perubahan ini';
    end if;
    update public.products set stok = v_old_stock where id = v_old_product.id returning * into v_old_product;
    update public.products set stok = v_new_stock where id = v_new_product.id returning * into v_new_product;
    v_products := jsonb_build_array(to_jsonb(v_old_product),to_jsonb(v_new_product));
  end if;
  update public.history set product_id = v_new_product.id, barcode = v_new_product.barcode,
    nama_barang = v_new_product.nama_barang, brand = v_new_product.brand,
    kategori = v_category, jumlah = v_quantity::integer, harga = v_price,
    tanggal = v_date, keterangan = v_note, oleh = v_operator
    where id = v_old.id returning * into v_history;
  return jsonb_build_object('products',v_products,'history',jsonb_build_array(to_jsonb(v_history)));
end;
$$;
revoke all on function public.revise_inventory_transaction(uuid,uuid,timestamptz,jsonb,boolean) from public, anon;
grant execute on function public.revise_inventory_transaction(uuid,uuid,timestamptz,jsonb,boolean) to authenticated;

commit;
