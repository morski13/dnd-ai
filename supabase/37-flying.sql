-- 37: flying on the battle map (2026-11-04). Safe to run again.
-- map_tokens.z: how high the creature flies (feet above the ground it's over).
-- map_tokens.fly: a flying speed it has for now (the Fly spell: 60), on top of its own.
alter table public.map_tokens add column if not exists z int not null default 0;
alter table public.map_tokens add column if not exists fly int;
