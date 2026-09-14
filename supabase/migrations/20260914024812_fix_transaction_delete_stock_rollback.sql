begin;

create or replace function public.revise_inventory_transaction(
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

  select * into v_old_product
    from public.products p
    where p.store_id = p_store_id
      and (
        (v_old.product_id is not null and p.id = v_old.product_id)
        or (v_old.product_id is null and p.barcode = v_old.barcode)
      )
    order by case when p.id = v_old.product_id then 0 else 1 end
    limit 1
    for update;
  if not found then raise exception 'Produk asal transaksi tidak ditemukan. Stok tidak dapat dikoreksi otomatis.'; end if;
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
