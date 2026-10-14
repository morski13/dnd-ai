-- =====================================================================
-- D&D AI — Each character sheet's own look: { theme, accent, font, allText, zoom } (see lib/themes.ts).
-- The DM's table look lives in campaigns.settings.session_theme (no SQL needed). Safe to run again.
-- =====================================================================

alter table public.characters add column if not exists sheet_style jsonb;

select 'Sheet styles ready' as result;
