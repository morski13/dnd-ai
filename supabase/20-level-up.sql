-- =====================================================================
-- D&D AI — Level-ups: remembers the last level-ups so a mistake can be undone.
-- Each entry: when, which class and level, a short summary, and the character as it was before.
-- Safe to run again.
-- =====================================================================

alter table public.characters add column if not exists level_log jsonb not null default '[]'::jsonb;

select 'Level-ups ready' as result;
