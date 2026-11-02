-- 29: Sessions the players start themselves ("Track this game" on the character sheet), for games where
-- the DM doesn't run Session mode. It's an ordinary session, so every roll in it counts in the stats;
-- when the DM opens Session mode during it, the DM simply carries on in the same session.
-- Re-runnable.

alter table public.sessions add column if not exists kind text not null default 'dm';
alter table public.sessions drop constraint if exists sessions_kind_check;
alter table public.sessions add constraint sessions_kind_check check (kind in ('dm', 'table'));
alter table public.sessions add column if not exists started_by uuid references auth.users(id) on delete set null;

comment on column public.sessions.kind is 'dm = started by the DM in Session mode; table = started by a player from their sheet';
comment on column public.sessions.started_by is 'who started the session (players can start and end table sessions; the app does it with the secret key after checking membership)';
