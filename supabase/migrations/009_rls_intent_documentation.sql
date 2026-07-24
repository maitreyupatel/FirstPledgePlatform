-- 009_rls_intent_documentation.sql
-- Applied to production 2026-07-24 via Supabase MCP.
-- Document the intentional RLS posture flagged by the security advisor:
-- RLS is ENABLED with NO policies on these tables, which means default-deny
-- for anon/authenticated PostgREST access. This is deliberate — all runtime
-- access goes through the Express server using the service role. Do NOT add
-- permissive policies without changing that architecture.
COMMENT ON TABLE products IS 'RLS default-deny intended: no anon/authenticated REST access. Server-side access via service role only.';
COMMENT ON TABLE ingredients IS 'RLS default-deny intended: no anon/authenticated REST access. Server-side access via service role only.';
COMMENT ON TABLE ingredient_analyses IS 'RLS default-deny intended: AI analysis cache, service role only.';
COMMENT ON TABLE product_queue IS 'RLS default-deny intended: cron work queue, service role only.';
