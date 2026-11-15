-- Keepalive: Supabase pausiert kostenlose Projekte nach ca. 7 Tagen ohne Aktivität.
-- Der GitHub-Workflow .github/workflows/keepalive.yml ruft diese Funktion alle
-- zwei Tage auf. Sie liest keine Daten, sie gibt nur "ok" und die Uhrzeit zurück.

create or replace function public.keepalive()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'ok ' || now()::text;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
