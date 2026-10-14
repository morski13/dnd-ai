-- 25: The Tavern assistant (our own D&D helper). Re-runnable.
-- * profiles.assistant_style: how the assistant talks to you (tavern keeper, dwarf, lord…), your own choice.
-- * assistant_chats / assistant_messages: your conversations. Only you can see your own chats.
--   Answers keep the sources they used and your 👍/👎, which later become training data for our own model.

alter table public.profiles add column if not exists assistant_style text;

create table if not exists public.assistant_chats (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  campaign_id  uuid references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  mode         text not null default 'rules' check (mode in ('rules', 'character', 'session', 'lore')),
  title        text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists assistant_chats_user_idx on public.assistant_chats (user_id, updated_at desc);

create table if not exists public.assistant_messages (
  id           uuid primary key default gen_random_uuid(),
  chat_id      uuid not null references public.assistant_chats(id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  role         text not null check (role in ('user', 'assistant')),
  content      text not null,
  verdict      text check (verdict in ('yes', 'no', 'depends', 'info')),
  style        text,
  model        text,                       -- which AI answered ("groq · openai/gpt-oss-120b", later our own)
  sources      jsonb not null default '[]',
  checks       jsonb not null default '[]',
  rating       smallint not null default 0 check (rating in (-1, 0, 1)),
  has_secrets  boolean not null default false,  -- used DM-only notes: never leaves the DM, never used for training
  prompt       jsonb,                    -- exactly what the AI was sent (for training our own model)
  correction   text,                     -- after a 👎: the right answer, written by the player (best training data)
  created_at   timestamptz not null default now()
);
alter table public.assistant_messages add column if not exists prompt jsonb;
alter table public.assistant_messages add column if not exists correction text;
create index if not exists assistant_messages_chat_idx on public.assistant_messages (chat_id, created_at);

alter table public.assistant_chats enable row level security;
alter table public.assistant_messages enable row level security;

drop policy if exists "assistant chats: own" on public.assistant_chats;
create policy "assistant chats: own" on public.assistant_chats for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "assistant messages: own" on public.assistant_messages;
create policy "assistant messages: own" on public.assistant_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.assistant_chats c where c.id = chat_id and c.user_id = (select auth.uid())));

revoke all on public.assistant_chats, public.assistant_messages from anon;
grant select, insert, update, delete on public.assistant_chats, public.assistant_messages to authenticated;

select 'Tavern assistant ready' as result;
