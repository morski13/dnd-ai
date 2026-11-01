-- 27: A character's own rules (content from other books / homebrew for ONE character). Re-runnable.
-- homebrew = { crit_range, extra_crit_dice, toggles: [{ id, name, on, applies_to, damage, damage_type }] }
--   crit_range / extra_crit_dice null = worked out from the classes (Champion 19–20, Brutal Critical).
-- The character's own actions are ordinary entries in characters.attacks with "custom": true,
-- and their own limited uses are ordinary entries in characters.resources with "custom": true.
-- Who can change it: the same rule as the rest of the character (owner or DM, policy "characters: edit").
alter table public.characters add column if not exists homebrew jsonb not null default '{}'::jsonb;
