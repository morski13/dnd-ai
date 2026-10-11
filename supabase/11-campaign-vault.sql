-- =====================================================================
-- D&D AI — Campaign page: folders, documents and pictures
-- Everything is secret until the DM shares it. Shared documents can still hold
-- "secret blocks": players get a copy with those parts removed, never the original.
-- Safe to run again.
-- =====================================================================

-- 1. Folders (a set of standard ones per campaign, plus the DM's own)
create table if not exists public.vault_folders (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  kind        text not null check (kind in ('plans', 'npcs', 'maps', 'places', 'shops', 'fights', 'goals', 'factions', 'lore', 'handouts', 'custom')),
  name        text not null,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists vault_folders_one_per_kind on public.vault_folders (campaign_id, kind) where kind <> 'custom';
create index if not exists vault_folders_campaign_idx on public.vault_folders (campaign_id);

-- 2. Entries: a document or a picture (a document can also have a cover picture)
create table if not exists public.vault_entries (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  folder_id    uuid not null references public.vault_folders(id) on delete cascade,
  parent_id    uuid references public.vault_entries(id) on delete cascade,  -- a picture placed inside a document
  kind         text not null check (kind in ('doc', 'image')),
  title        text not null default 'Untitled',
  image_path   text,           -- in the private "vault" storage bucket
  thumb_path   text,
  image_w      int,
  image_h      int,
  public_doc   jsonb,          -- the document with secret blocks removed (what players get)
  public_text  text,
  shared       boolean not null default false,
  status       text check (status in ('open', 'done', 'failed')),  -- goals & milestones
  sort         int not null default 0,
  created_by   uuid default auth.uid() references public.profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists vault_entries_folder_idx on public.vault_entries (folder_id);
create index if not exists vault_entries_campaign_idx on public.vault_entries (campaign_id);

-- 3. The full document (with secrets). DM only.
create table if not exists public.vault_docs (
  entry_id    uuid primary key references public.vault_entries(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  doc         jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  text        text not null default '',
  updated_at  timestamptz not null default now()
);

-- 4. Who sees what
create or replace function public.vault_entry_visible(p_entry uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vault_entries e
    left join public.vault_entries p on p.id = e.parent_id
    where e.id = p_entry and (e.shared or coalesce(p.shared, false))
  )
$$;
create or replace function public.vault_folder_visible(p_folder uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vault_entries e where e.folder_id = p_folder and e.shared and e.parent_id is null)
$$;
revoke execute on function public.vault_entry_visible(uuid), public.vault_folder_visible(uuid) from public, anon;
grant execute on function public.vault_entry_visible(uuid), public.vault_folder_visible(uuid) to authenticated;

alter table public.vault_folders enable row level security;
alter table public.vault_entries enable row level security;
alter table public.vault_docs enable row level security;

drop policy if exists "vault folders: read" on public.vault_folders;
create policy "vault folders: read" on public.vault_folders for select to authenticated
  using (public.is_dm(campaign_id) or (public.is_member(campaign_id) and public.vault_folder_visible(id)));
drop policy if exists "vault folders: DM writes" on public.vault_folders;
create policy "vault folders: DM writes" on public.vault_folders for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));

drop policy if exists "vault entries: read" on public.vault_entries;
create policy "vault entries: read" on public.vault_entries for select to authenticated
  using (public.is_dm(campaign_id) or (public.is_member(campaign_id) and public.vault_entry_visible(id)));
drop policy if exists "vault entries: DM writes" on public.vault_entries;
create policy "vault entries: DM writes" on public.vault_entries for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));

drop policy if exists "vault docs: DM only" on public.vault_docs;
create policy "vault docs: DM only" on public.vault_docs for all to authenticated
  using (public.is_dm(campaign_id)) with check (public.is_dm(campaign_id));

grant select, insert, update, delete on public.vault_folders, public.vault_entries, public.vault_docs to authenticated;
revoke all on public.vault_folders, public.vault_entries, public.vault_docs from anon;

-- 5. Private file storage for pictures (the app's server reads and writes it after checking who you are)
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit)
    values ('vault', 'vault', false, 8388608)
    on conflict (id) do nothing;
  end if;
end $$;
