-- 24: AI backups. Remembers, per AI in your chain, when it's out of free uses ("resting"), what the
-- provider says is left and how often the app used it today, so the app skips a tired AI straight away
-- and the DM can see the status on the Mind map. Server only: no browser can read or change it.
-- Re-runnable. Without this table the app still switches AIs, it just forgets after a restart.

create table if not exists public.ai_provider_status (
  id          text primary key,           -- "api.groq.com|openai/gpt-oss-120b" (no keys stored)
  state       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);
alter table public.ai_provider_status enable row level security;
revoke all on public.ai_provider_status from anon, authenticated;

select 'AI backups ready' as result;
