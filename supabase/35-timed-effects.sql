-- 35: battle engine phase 1 (2026-11-04). Safe to run again.
-- combatants.effects: conditions and effects that last a while ("Hold Person: Paralyzed, WIS save DC 15 at the end
-- of each of its turns, while Orrin concentrates"). The app ticks them when the turn moves on.
alter table public.combatants add column if not exists effects jsonb not null default '[]';
