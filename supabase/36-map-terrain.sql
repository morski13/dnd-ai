-- 36: battle engine phase 2 (2026-11-04). Safe to run again.
-- battle_maps.terrain: squares the DM painted: { "walls": ["3,4", ...], "difficult": ["5,5", ...] }.
-- Walls block movement and line of sight (cover); difficult terrain costs double movement.
alter table public.battle_maps add column if not exists terrain jsonb not null default '{}';
