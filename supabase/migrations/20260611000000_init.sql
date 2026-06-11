-- MirrorMe initial schema: profiles, photos, tryons, RLS, private buckets.
-- Apply with: npx supabase link --project-ref <ref> && npx supabase db push
-- (or paste into the Supabase SQL editor).

-- ── profiles ─────────────────────────────────────────────────────────
-- 1:1 with auth.users; billing-ready fields (plan / trial_ends_at /
-- tryon_count) so Stripe (Phase 5) drops in with no migration.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  plan text not null default 'trial',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  tryon_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);
-- No client insert/update/delete: profile rows are created by the signup
-- trigger below and mutated only server-side (service role bypasses RLS).

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── photos: the user's own base photos ───────────────────────────────
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index photos_user_id_idx on public.photos (user_id);

alter table public.photos enable row level security;

create policy "photos_all_own" on public.photos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ── tryons: generated results (parent_tryon_id powers chaining) ──────
create table public.tryons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  base_photo_id uuid references public.photos (id) on delete set null,
  parent_tryon_id uuid references public.tryons (id) on delete set null,
  garment_source_url text not null,
  result_storage_path text not null,
  created_at timestamptz not null default now()
);

create index tryons_user_id_created_idx on public.tryons (user_id, created_at desc);

alter table public.tryons enable row level security;

create policy "tryons_select_own" on public.tryons
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- Inserts happen server-side only (service role), after quota + generation.

-- Atomic quota counter, called server-side after each successful generation.
create or replace function public.increment_tryon_count(p_user_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.profiles set tryon_count = tryon_count + 1 where id = p_user_id;
$$;

-- ── storage: PRIVATE buckets ─────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false), ('generated', 'generated', false)
on conflict (id) do nothing;

-- Users manage only their own folder ({user_id}/...) in the photos bucket.
create policy "photos_bucket_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "photos_bucket_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "photos_bucket_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The generated bucket has NO client policies: written and read exclusively
-- by the backend (service role) and served via short-lived signed URLs.
