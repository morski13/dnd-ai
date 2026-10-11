-- =====================================================================
-- D&D AI — Optional AI reader: saves the AI's reading of the campaign notes,
-- so it runs only when the DM asks (not on every page view).
-- Two copies per campaign: "dm" (made from all notes, secrets included) and
-- "player" (made only from the pages the DM shared). Players only ever get the "player" copy.
-- Only the server can read or write this table (no policies = no access with a user's key).
-- Safe to run again.
-- =====================================================================

create table if not exists public.ai_readings (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  view        text not null check (view in ('dm', 'player')),
  notes_hash  text not null,          -- which version of the notes it read
  result      jsonb not null,
  model       text,
  created_at  timestamptz not null default now(),
  primary key (campaign_id, view)
);
alter table public.ai_readings enable row level security;
revoke all on public.ai_readings from anon, authenticated;

select 'AI reader ready' as result;
