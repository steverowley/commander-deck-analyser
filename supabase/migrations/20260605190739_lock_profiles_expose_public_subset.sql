-- Stop public.profiles from leaking supporter_total_cents / supporter_since /
-- pref_retailer / account UUIDs to anyone holding the public anon key.
--
-- Before this migration the SELECT policy was "Anyone can read profiles"
-- USING (true), so every column of every row was world-readable. Public
-- contexts (the gallery) only need username + the supporter flag, so we expose
-- those via a view and lock the base table to owner-only reads.
--
-- App code: gallery reads (loadPublicDecks / loadRandomRolls in
-- src/lib/storage-supabase.js) read public.public_profiles, NOT public.profiles.
-- The owner's own-profile read (src/lib/profile.js#loadProfile) stays on the
-- base table, filtered by user_id, and is permitted by the owner-only policy.
-- The PayPal webhook writes via the service role and bypasses RLS.

create or replace view public.public_profiles
  with (security_invoker = false) as
  select user_id, username, supporter
  from public.profiles;

revoke all on public.public_profiles from public, anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

drop policy if exists "Anyone can read profiles" on public.profiles;

create policy "Owner can read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = user_id);
