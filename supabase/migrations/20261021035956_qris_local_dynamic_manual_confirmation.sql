begin;

alter table public.app_branding
  add column if not exists qris_payload text;
grant update (qris_image_url, qris_payload) on public.app_branding to authenticated;

-- Payload decoded from public/qris-base.jpg (ABElektronik static QRIS).
update public.app_branding
set qris_payload = '00020101021126610014COM.GO-JEK.WWW01189360091435013108460210G5013108460303UMI51440014ID.CO.QRIS.WWW0215ID10266191687470303UMI5204549953033605802ID5912ABElektronik6010MAJALENGKA61054545862070703A0163043E9A'
where id = 'default' and qris_payload is null;

create or replace function public.confirm_qris_payment(p_payment_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_payment public.qris_payments;
  v_settlement jsonb;
  v_error text;
  v_manual_transaction_id text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sesi login tidak valid' using errcode = '42501';
  end if;

  select * into v_payment
  from public.qris_payments
  where id = p_payment_id
  for update;
  if not found then raise exception 'Transaksi QRIS tidak ditemukan'; end if;
  if not exists (
    select 1 from public.stores s
    where s.id = v_payment.store_id and s.owner_id = (select auth.uid())
  ) then
    raise exception 'Akses transaksi QRIS ditolak' using errcode = '42501';
  end if;
  if v_payment.status = 'paid' then
    return jsonb_build_object('status', 'paid', 'duplicate', true);
  end if;
  if v_payment.status not in ('pending', 'expired', 'inventory_error') then
    raise exception 'Status transaksi QRIS tidak dapat dikonfirmasi';
  end if;

  v_manual_transaction_id := coalesce(v_payment.transaction_id, 'MANUAL-' || v_payment.id::text);

  -- The cashier has checked the GoBiz settlement. If stock changed after the
  -- app reservation elapsed, keep the received-funds record and surface the
  -- inventory problem instead of losing the payment confirmation.
  begin
    v_settlement := public.settle_qris_payment(
      v_payment.order_id,
      v_manual_transaction_id,
      v_payment.gross_amount
    );

    update public.qris_payments
    set provider_status = 'manual_confirmed'
    where id = v_payment.id;

    update public.history h
    set keterangan = replace(h.keterangan, 'Penjualan QRIS Midtrans ', 'Penjualan QRIS ')
    where h.id in (
      select (history_row->>'id')::uuid
      from jsonb_array_elements(coalesce(v_settlement->'result'->'history', '[]'::jsonb)) as history_rows(history_row)
      where history_row->>'id' is not null
    );

    update public.inventory_requests
    set payload = jsonb_set(payload, '{note}', to_jsonb('Penjualan QRIS ' || v_payment.order_id), true)
    where id = v_payment.id;

    return jsonb_build_object('status', 'paid', 'duplicate', false);
  exception when others then
    get stacked diagnostics v_error = message_text;
    update public.qris_payments
    set status = 'inventory_error',
        provider_status = 'manual_confirmed',
        transaction_id = v_manual_transaction_id,
        paid_at = coalesce(paid_at, now()),
        failure_reason = left('Dana dikonfirmasi kasir, tetapi stok belum tersimpan: ' || v_error, 500)
    where id = v_payment.id;
    return jsonb_build_object('status', 'inventory_error', 'duplicate', false,
      'message', 'Dana sudah dikonfirmasi di GoBiz, tetapi stok perlu ditinjau admin.');
  end;
end;
$$;
revoke all on function public.confirm_qris_payment(uuid) from public, anon;
grant execute on function public.confirm_qris_payment(uuid) to authenticated;

commit;
