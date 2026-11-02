-- 31: homebrew made in the app, per campaign: spells, feats and subclasses (monsters go in the monsters table).
-- The DM's are approved at once; a player's are requests (pending → approved / rejected with a note). Re-runnable.
create table if not exists public.campaign_homebrew (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  kind         text not null check (kind in ('spell', 'feat', 'subclass')),
  rules        text not null default '2024' check (rules in ('2014', '2024')),
  parent       text not null default '',          -- subclass: its class
  name         text not null,
  data         jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  dm_note      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists campaign_homebrew_name_idx on public.campaign_homebrew (campaign_id, kind, rules, parent, lower(name));

alter table public.campaign_homebrew enable row level security;
drop policy if exists "homebrew: read" on public.campaign_homebrew;
drop policy if exists "homebrew: add" on public.campaign_homebrew;
drop policy if exists "homebrew: change" on public.campaign_homebrew;
drop policy if exists "homebrew: delete" on public.campaign_homebrew;
create policy "homebrew: read" on public.campaign_homebrew for select to authenticated
  using (public.is_member(campaign_id) and (status = 'approved' or requested_by = auth.uid() or public.is_dm(campaign_id)));
create policy "homebrew: add" on public.campaign_homebrew for insert to authenticated
  with check (public.is_member(campaign_id) and requested_by = auth.uid() and (status = 'pending' or public.is_dm(campaign_id)));
create policy "homebrew: change" on public.campaign_homebrew for update to authenticated
  using (public.is_dm(campaign_id) or (requested_by = auth.uid() and status <> 'approved'))
  with check (public.is_dm(campaign_id) or (requested_by = auth.uid() and status = 'pending'));
create policy "homebrew: delete" on public.campaign_homebrew for delete to authenticated
  using (public.is_dm(campaign_id) or (requested_by = auth.uid() and status <> 'approved'));
grant select, insert, update, delete on public.campaign_homebrew to authenticated;
revoke all on public.campaign_homebrew from anon;
