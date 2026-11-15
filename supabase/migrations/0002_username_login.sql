-- Login mit Benutzername + Passwort.
-- Benutzernamen werden intern zu <name>@travelbuddy.local (es gehen nie Mails raus).
-- Konten legt man im SQL Editor an, die App hat keine Registrierung:
--
--   select private.create_user('robin', 'ein-sicheres-passwort');
--
-- Das Konto ist damit sofort angelegt und freigeschaltet. Das Passwort
-- lässt sich danach in der App unter "Konto & Offline" ändern.

create or replace function private.create_user(username text, password text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uname text := lower(trim(username));
  mail  text := uname || '@travelbuddy.local';
  uid   uuid := gen_random_uuid();
begin
  if uname !~ '^[a-z0-9._-]{2,32}$' then
    raise exception 'Benutzername nur mit a-z, 0-9, Punkt, Minus, Unterstrich (2-32 Zeichen)';
  end if;
  if length(password) < 8 then
    raise exception 'Passwort muss mindestens 8 Zeichen haben';
  end if;
  if exists (select 1 from auth.users where email = mail) then
    raise exception 'Benutzer % gibt es schon', uname;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token, phone_change, phone_change_token
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
    extensions.crypt(password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('username', uname),
    now(), now(), '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), uid, uid::text,
    jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true),
    'email', now(), now(), now()
  );

  insert into public.members (email, name) values (mail, uname)
  on conflict (email) do nothing;

  return uid;
end;
$$;

revoke all on function private.create_user(text, text) from public, anon, authenticated;
