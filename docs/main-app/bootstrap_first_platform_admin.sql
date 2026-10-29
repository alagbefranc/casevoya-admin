-- PROPOSED main-repo migration (alagbefranc/casevoya). NOT applied; the admin portal never runs DDL.
-- An audited, advisory-locked first-admin bootstrap. scripts/bootstrap-first-admin.mjs calls it
-- when present and otherwise falls back to a guarded direct insert.
create or replace function public.bootstrap_first_platform_admin(p_user_id uuid, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := left(coalesce(nullif(btrim(p_note), ''), 'first platform admin (bootstrap)'), 200);
begin
  if app.support_service_role() is distinct from true then
    raise exception 'bootstrap runs with the service role only' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.platform_admins:bootstrap'));
  if exists (select 1 from public.platform_admins) then
    raise exception 'a platform admin already exists; bootstrap is one-time only' using errcode = '55000';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null) then
    raise exception 'no confirmed user with that id' using errcode = '22023';
  end if;
  insert into public.platform_admins (user_id, note, created_by) values (p_user_id, v_note, p_user_id);
  perform app.record_audit_event(
    null, 'platform_admin.bootstrapped', 'public.platform_admins', p_user_id, 'success',
    jsonb_build_object('via', 'casevoya-admin bootstrap')
  );
  return p_user_id;
end;
$$;

revoke all on function public.bootstrap_first_platform_admin(uuid, text) from public, anon, authenticated;
grant execute on function public.bootstrap_first_platform_admin(uuid, text) to service_role;
