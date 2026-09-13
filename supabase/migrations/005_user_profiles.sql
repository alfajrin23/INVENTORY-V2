begin;

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger user_profiles_updated before update on public.user_profiles
  for each row execute function public.touch_updated_at();

alter table public.user_profiles enable row level security;

create policy user_profiles_own_read on public.user_profiles for select to authenticated
  using (id = (select auth.uid()));

revoke all on public.user_profiles from anon, authenticated;
grant select on public.user_profiles to authenticated;

create function public.handle_new_user_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_profiles(id, role)
  values (new.id, 'admin')
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

insert into public.user_profiles(id, role)
select id, 'admin'
from auth.users
on conflict (id) do nothing;

commit;
