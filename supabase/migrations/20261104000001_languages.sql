-- =============================================================================
-- 20261104000001_languages.sql — all 22 scheduled languages of India as profile languages
--
-- Intent
--   profiles.preferred_language (enum app_language) accepted only 'en' and 'hi'. The app now
--   offers English + the 22 languages of the Eighth Schedule; codes match src/domain/languages.ts.
--   ADD VALUE IF NOT EXISTS keeps this safe to re-run.
-- =============================================================================
alter type public.app_language add value if not exists 'bn';
alter type public.app_language add value if not exists 'mr';
alter type public.app_language add value if not exists 'te';
alter type public.app_language add value if not exists 'ta';
alter type public.app_language add value if not exists 'gu';
alter type public.app_language add value if not exists 'ur';
alter type public.app_language add value if not exists 'kn';
alter type public.app_language add value if not exists 'or';
alter type public.app_language add value if not exists 'ml';
alter type public.app_language add value if not exists 'pa';
alter type public.app_language add value if not exists 'as';
alter type public.app_language add value if not exists 'mai';
alter type public.app_language add value if not exists 'sat';
alter type public.app_language add value if not exists 'ks';
alter type public.app_language add value if not exists 'ne';
alter type public.app_language add value if not exists 'sd';
alter type public.app_language add value if not exists 'doi';
alter type public.app_language add value if not exists 'kok';
alter type public.app_language add value if not exists 'mni';
alter type public.app_language add value if not exists 'brx';
alter type public.app_language add value if not exists 'sa';
