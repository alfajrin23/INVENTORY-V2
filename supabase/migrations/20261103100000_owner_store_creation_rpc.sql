begin;

-- Create branches through one explicit owner check instead of relying on the
-- client to infer the store owner from the active branch.
create or replace function public.create_owned_store(
  p_name text,
  p_address text default '',
  p_address_link text default '',
  p_photo text default null
)
returns public.stores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_store public.stores;
begin
  if v_owner_id is null then
    raise exception 'Silakan masuk terlebih dahulu.' using errcode = '28000';
  end if;

  if not public.current_user_can_create_store() then
    raise exception 'Hanya pemilik toko yang dapat menambahkan cabang.' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Nama toko wajib diisi.' using errcode = '23514';
  end if;

  insert into public.stores(owner_id, name, address, address_link, photo)
    values (v_owner_id, trim(p_name), coalesce(p_address, ''), coalesce(p_address_link, ''), nullif(trim(p_photo), ''))
    returning * into v_store;

  return v_store;
end;
$$;

revoke all on function public.create_owned_store(text, text, text, text) from public, anon;
grant execute on function public.create_owned_store(text, text, text, text) to authenticated;

commit;
