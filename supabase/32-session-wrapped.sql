-- 32: Session Wrapped. When a session ends (the DM's or a Track game one), everyone at the table gets a
-- tap-through story of the night: personal slides, rotating awards, a "Moment of the night" vote and an
-- optional teaser from the DM for next time.
--  - sessions.teaser: the DM's "next time…" line, shown on the last slide (only the DM writes it).
--  - session_votes: one vote per member per session for the Moment of the night. moment_key names a moment
--    of the session recap (open rolls only, so it never points at a secret roll).
-- Re-runnable.

alter table public.sessions add column if not exists teaser text;
alter table public.sessions drop constraint if exists sessions_teaser_len;
alter table public.sessions add constraint sessions_teaser_len check (teaser is null or char_length(teaser) <= 400);
comment on column public.sessions.teaser is 'the DM''s teaser for the next session, shown at the end of Session Wrapped';

create table if not exists public.session_votes (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  moment_key  text not null check (char_length(moment_key) between 1 and 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index if not exists session_votes_campaign_idx on public.session_votes (campaign_id);

alter table public.session_votes enable row level security;
drop policy if exists "votes: read" on public.session_votes;
drop policy if exists "votes: cast" on public.session_votes;
drop policy if exists "votes: change" on public.session_votes;
drop policy if exists "votes: take back" on public.session_votes;

-- everyone at the table sees the tally
create policy "votes: read" on public.session_votes for select to authenticated
  using (public.is_member(campaign_id));
-- you vote for yourself only, in a session of your campaign that has ended
create policy "votes: cast" on public.session_votes for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_member(campaign_id)
    and exists (select 1 from public.sessions s where s.id = session_id and s.campaign_id = session_votes.campaign_id and s.ended_at is not null)
  );
create policy "votes: change" on public.session_votes for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid() and public.is_member(campaign_id)
    and exists (select 1 from public.sessions s where s.id = session_id and s.campaign_id = session_votes.campaign_id and s.ended_at is not null)
  );
create policy "votes: take back" on public.session_votes for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.session_votes to authenticated;
revoke all on public.session_votes from anon;

-- the tally moves live on everyone's screen
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'session_votes') then
    alter publication supabase_realtime add table public.session_votes;
  end if;
end $$;
