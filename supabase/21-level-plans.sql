-- =====================================================================
-- D&D AI — Plan a level-up ahead: the player's saved choices for their next level
-- ({ className, picks, asi, hp, savedAt }), applied later with one tap. Safe to run again.
-- =====================================================================

alter table public.characters add column if not exists level_plan jsonb;

select 'Level-up plans ready' as result;
