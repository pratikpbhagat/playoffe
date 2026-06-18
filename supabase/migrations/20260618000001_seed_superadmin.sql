-- Seed default superadmin for staging/prod bootstrap.
-- Safe to run multiple times. Password should be rotated after first login.

do $$
declare
  v_user_id uuid;
begin
  -- Check if user already exists
  select id into v_user_id from auth.users where email = 'admin@playoffe.com';

  if v_user_id is null then
    insert into auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud
    )
    values (
      gen_random_uuid(),
      'admin@playoffe.com',
      crypt('Playoffe@2026!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"role":"super_admin"}'::jsonb,
      '{"full_name":"Admin"}'::jsonb,
      now(), now(), 'authenticated', 'authenticated'
    )
    returning id into v_user_id;
  else
    update auth.users
    set raw_app_meta_data = raw_app_meta_data || '{"role":"super_admin"}'::jsonb,
        encrypted_password = crypt('Playoffe@2026!', gen_salt('bf')),
        updated_at = now()
    where id = v_user_id;
  end if;

  -- Upsert into players (profile table)
  insert into players (id, email, username, full_name, gender, role)
  values (v_user_id, 'admin@playoffe.com', 'admin', 'Admin', 'male', 'admin')
  on conflict (id) do update
    set role = 'admin',
        updated_at = now();
end;
$$;
