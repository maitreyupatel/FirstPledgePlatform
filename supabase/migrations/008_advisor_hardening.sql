-- 008_advisor_hardening.sql
-- Applied to production 2026-07-24 via Supabase MCP.
-- Security-advisor hardening (all zero-risk):
-- 1. rls_auto_enable is an event-trigger function; anon/authenticated have no
--    reason to hold EXECUTE on it.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated, public;

-- 2. Pin search_path on flagged functions (mutable search_path lint).
ALTER FUNCTION public.update_updated_at_column() SET search_path = 'public';
ALTER FUNCTION public.normalize_ingredient_name(text) SET search_path = 'public';
