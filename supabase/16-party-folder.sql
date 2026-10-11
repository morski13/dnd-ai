-- =====================================================================
-- D&D AI — Campaign page: a "Player characters" folder (backstories, family, bonds, DM hooks).
-- Needs 11-campaign-vault.sql. Safe to run again.
-- =====================================================================
alter table public.vault_folders drop constraint if exists vault_folders_kind_check;
alter table public.vault_folders add constraint vault_folders_kind_check
  check (kind in ('plans', 'npcs', 'party', 'maps', 'places', 'shops', 'fights', 'goals', 'factions', 'lore', 'handouts', 'custom'));

select 'Player characters folder ready' as result;
