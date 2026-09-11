begin;
create function public.process_inventory_transaction(
  p_store_id uuid, p_request_id uuid, p_category text, p_items jsonb,
  p_note text default null, p_operator text default null, p_date timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_item record; v_product public.products; v_history public.history;
  v_payload jsonb; v_previous public.inventory_requests;
  v_products jsonb := '[]'; v_histories jsonb := '[]'; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu' using errcode = '42501'; end if;
  -- Store lock also serializes store deletion and prevents cross-request deadlocks.
  perform 1 from public.stores where id = p_store_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Toko tidak ditemukan atau akses ditolak' using errcode = '42501'; end if;
  if p_request_id is null or p_category is null or p_category not in ('masuk','keluar') then
    raise exception 'Jenis transaksi atau ID permintaan tidak valid'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Item tidak valid'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then raise exception 'Isi 1 sampai 100 item'; end if;
  v_payload := jsonb_build_object('category',p_category,'items',p_items,'note',p_note,'operator',p_operator,'date',p_date);
  select * into v_previous from public.inventory_requests where id = p_request_id;
  if found then
    if v_previous.store_id <> p_store_id or v_previous.payload <> v_payload then raise exception 'ID permintaan sudah digunakan'; end if;
    -- Preserve the original receipt, but return current stock on a later retry.
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
  -- Aggregate repeated products and lock in deterministic order.
  for v_item in select (value->>'productId')::uuid as id, sum((value->>'quantity')::integer)::bigint as qty
    from jsonb_array_elements(p_items) group by 1 order by 1 loop
    if v_item.qty > 1000000 then raise exception 'Jumlah terlalu besar'; end if;
    select * into v_product from public.products where id = v_item.id and store_id = p_store_id for update;
    if not found then raise exception 'Produk tidak ditemukan di toko aktif'; end if;
    if p_category = 'keluar' and v_product.stok < v_item.qty then
      raise exception 'Stok % tidak cukup (tersedia %)', v_product.nama_barang, v_product.stok; end if;
    update public.products set stok = stok + case when p_category = 'keluar' then -v_item.qty else v_item.qty end
      where id = v_product.id returning * into v_product;
    insert into public.history(store_id,product_id,barcode,tanggal,nama_barang,brand,kategori,jumlah,harga,keterangan,oleh)
      values(p_store_id,v_product.id,v_product.barcode,coalesce(p_date,now()),v_product.nama_barang,v_product.brand,
        p_category,v_item.qty,v_product.harga,coalesce(p_note,case when p_category='keluar' then 'Penjualan' else 'Restock' end),
        coalesce(p_operator,'Kasir')) returning * into v_history;
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

-- Product editor preserves stock editing, with a conflict check and an atomic adjustment history.
create function public.update_inventory_product(p_id uuid, p_store_id uuid, p_expected_stock integer, p_product jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old public.products; v_new public.products; v_history public.history; v_delta integer;
begin
  perform 1 from public.stores where id=p_store_id and owner_id=auth.uid() for update;
  if not found then raise exception 'Akses toko ditolak' using errcode='42501'; end if;
  select * into v_old from public.products where id=p_id and store_id=p_store_id for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if p_expected_stock is distinct from v_old.stok then raise exception 'Stok berubah. Muat ulang produk sebelum mengedit.'; end if;
  if (p_product->>'stok')::numeric <> trunc((p_product->>'stok')::numeric) then raise exception 'Stok harus bilangan bulat'; end if;
  v_delta := (p_product->>'stok')::integer - v_old.stok;
  update public.products set nama_barang=p_product->>'nama_barang',brand=p_product->>'brand',
    harga=(p_product->>'harga')::numeric,stok=(p_product->>'stok')::integer,barcode=p_product->>'barcode'
    where id=p_id returning * into v_new;
  if v_delta <> 0 then
    insert into public.history(store_id,product_id,barcode,nama_barang,brand,kategori,jumlah,harga,keterangan,oleh)
    values(p_store_id,p_id,v_new.barcode,v_new.nama_barang,v_new.brand,case when v_delta>0 then 'masuk' else 'keluar' end,
      abs(v_delta),v_new.harga,'Koreksi stok melalui edit produk','Admin') returning * into v_history;
  end if;
  return jsonb_build_object('products',jsonb_build_array(to_jsonb(v_new)),
    'history',case when v_delta<>0 then jsonb_build_array(to_jsonb(v_history)) else '[]'::jsonb end);
end;
$$;
revoke all on function public.update_inventory_product(uuid,uuid,integer,jsonb) from public, anon;
grant execute on function public.update_inventory_product(uuid,uuid,integer,jsonb) to authenticated;
commit;
