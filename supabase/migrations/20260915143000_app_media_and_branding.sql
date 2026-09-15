begin;

create table if not exists public.app_branding (
  id text primary key check (id = 'default'),
  profile_photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_branding enable row level security;

drop trigger if exists app_branding_updated on public.app_branding;
create trigger app_branding_updated
  before update on public.app_branding
  for each row execute function public.touch_updated_at();

insert into public.app_branding(id, profile_photo_url)
values ('default', null)
on conflict (id) do nothing;

revoke all on public.app_branding from anon, authenticated;
grant select on public.app_branding to authenticated;
grant update(profile_photo_url) on public.app_branding to authenticated;

drop policy if exists app_branding_authenticated_read on public.app_branding;
create policy app_branding_authenticated_read
  on public.app_branding for select to authenticated
  using (true);

drop policy if exists app_branding_admin_update on public.app_branding;
create policy app_branding_admin_update
  on public.app_branding for update to authenticated
  using (
    id = 'default'
    and exists (
      select 1 from public.user_profiles profile
      where profile.id = (select auth.uid()) and profile.role = 'admin'
    )
  )
  with check (
    id = 'default'
    and exists (
      select 1 from public.user_profiles profile
      where profile.id = (select auth.uid()) and profile.role = 'admin'
    )
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'inventory-assets',
  'inventory-assets',
  true,
  1048576,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists inventory_assets_authenticated_select on storage.objects;
create policy inventory_assets_authenticated_select
  on storage.objects for select to authenticated
  using (bucket_id = 'inventory-assets');

drop policy if exists inventory_assets_insert on storage.objects;
create policy inventory_assets_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inventory-assets'
    and (
      (
        (storage.foldername(name))[1] = 'branding'
        and exists (
          select 1 from public.user_profiles profile
          where profile.id = (select auth.uid()) and profile.role = 'admin'
        )
      )
      or
      (
        (storage.foldername(name))[1] = 'stores'
        and exists (
          select 1 from public.stores store_record
          where store_record.id::text = (storage.foldername(name))[2]
            and store_record.owner_id = (select auth.uid())
        )
      )
    )
  );

drop policy if exists inventory_assets_update on storage.objects;
create policy inventory_assets_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'inventory-assets'
    and (
      (
        (storage.foldername(name))[1] = 'branding'
        and exists (
          select 1 from public.user_profiles profile
          where profile.id = (select auth.uid()) and profile.role = 'admin'
        )
      )
      or
      (
        (storage.foldername(name))[1] = 'stores'
        and exists (
          select 1 from public.stores store_record
          where store_record.id::text = (storage.foldername(name))[2]
            and store_record.owner_id = (select auth.uid())
        )
      )
    )
  )
  with check (
    bucket_id = 'inventory-assets'
    and (
      (
        (storage.foldername(name))[1] = 'branding'
        and exists (
          select 1 from public.user_profiles profile
          where profile.id = (select auth.uid()) and profile.role = 'admin'
        )
      )
      or
      (
        (storage.foldername(name))[1] = 'stores'
        and exists (
          select 1 from public.stores store_record
          where store_record.id::text = (storage.foldername(name))[2]
            and store_record.owner_id = (select auth.uid())
        )
      )
    )
  );

drop policy if exists inventory_assets_delete on storage.objects;
create policy inventory_assets_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'inventory-assets'
    and (
      (
        (storage.foldername(name))[1] = 'branding'
        and exists (
          select 1 from public.user_profiles profile
          where profile.id = (select auth.uid()) and profile.role = 'admin'
        )
      )
      or
      (
        (storage.foldername(name))[1] = 'stores'
        and exists (
          select 1 from public.stores store_record
          where store_record.id::text = (storage.foldername(name))[2]
            and store_record.owner_id = (select auth.uid())
        )
      )
    )
  );

commit;
