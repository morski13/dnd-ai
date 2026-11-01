-- 28: Inspiration (2014) / Heroic Inspiration (2024) on the character sheet. Re-runnable.
-- The owner or the DM switches it (policy "characters: edit"); the DM usually gives it, the player uses it.
alter table public.characters add column if not exists inspiration boolean not null default false;
