-- Flame Boutique34: give the owner account access to the dashboard. Run once, after setup.sql.
-- 1. Supabase > Authentication > Users > Add user > Create new user: the owner's email and a strong password,
--    with "Auto Confirm User" ticked.
-- 2. Replace the email below with that same email (keep the quotes), then SQL Editor > New query > paste > Run.
insert into admins (user_id)
select id from auth.users where lower(email) = lower('ضع-بريد-المالك-هنا@gmail.com')
on conflict do nothing;

-- The answer must say: owner account linked = OK. If it says MISSING, the email above does not match the user's email.
select case when exists (select 1 from admins) then 'owner account linked = OK' else 'owner account linked = MISSING' end as result;
