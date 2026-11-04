-- 39: battle engine phase 4, spells (2026-11-04). Safe to run again.
-- combats.zones: lasting spell areas on the battle map (Spirit Guardians, Moonbeam, Cloudkill, Web…):
-- where they are, who cast them, what they do to creatures that enter or start / end a turn there.
alter table public.combats add column if not exists zones jsonb not null default '[]';
