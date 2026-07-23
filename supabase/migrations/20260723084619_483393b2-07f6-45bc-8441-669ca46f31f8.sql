
create extension if not exists "uuid-ossp";

-- 1. users
create table public.users (
  id uuid references auth.users on delete cascade not null primary key,
  email text not null,
  full_name text,
  plan text not null default 'free',
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);
grant select, insert, update, delete on public.users to authenticated;
grant all on public.users to service_role;
alter table public.users enable row level security;

create policy "Users can view own profile" on public.users
  for select to authenticated using (auth.uid() = id);
create policy "Users can update own profile" on public.users
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can insert own profile" on public.users
  for insert to authenticated with check (auth.uid() = id);

-- Trigger: auto-create user row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. sessions
create table public.sessions (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  phone_number text,
  status text not null default 'disconnected',
  hmac_token text not null,
  last_active_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);
grant select, insert, update, delete on public.sessions to authenticated;
grant all on public.sessions to service_role;
alter table public.sessions enable row level security;

create policy "Users can manage own sessions" on public.sessions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. monitored_groups
create table public.monitored_groups (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  group_name text not null,
  group_jid text not null,
  platform text not null default 'shopee',
  is_active boolean not null default true,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);
grant select, insert, update, delete on public.monitored_groups to authenticated;
grant all on public.monitored_groups to service_role;
alter table public.monitored_groups enable row level security;

create policy "Users can manage own monitored groups" on public.monitored_groups
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4. products
create table public.products (
  id uuid not null default uuid_generate_v4() primary key,
  user_id uuid references public.users(id) on delete cascade not null,
  title text not null,
  original_price numeric(10,2),
  promo_price numeric(10,2),
  commission_rate numeric(5,2),
  raw_link text not null,
  affiliate_link text not null,
  image_url text,
  category text,
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;

create policy "Users can manage own products" on public.products
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
