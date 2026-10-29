-- =============================================================================
-- 20261029000005_storage.sql — private storage buckets and object policies
--
-- Intent
--   Four PRIVATE buckets (no public bucket exists; the app plays media through short-lived
--   signed URLs only):
--     media      parent practice videos + therapist demo clips. 25 MB, video/* and image/*.
--                Path: {org_id}/{child_id}/{uuid}.mp4  (a matching public.media row is written
--                by the app after upload; media-retention deletes both after expires_at).
--     resources  resource library files. Path: {org_id}/{uuid}.{ext}, or global/{uuid}.{ext}.
--     avatars    staff/parent avatars and child photos. Path: {org_id}/{user_or_child_id}/{file}.
--     org-assets school logos / letterheads. Path: {org_id}/{file}.
--   Read rules mirror table RLS: only members of the school in the first path segment, and
--   for media only staff with access to the child, the child's guardians, or the uploader.
--   Parents can upload to `media` only for their own children and only while their latest
--   video-upload consent is granted.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', false, 26214400, array['video/*', 'image/*']),
  ('resources', 'resources', false, 52428800, array['application/pdf', 'image/*', 'video/*']),
  ('avatars', 'avatars', false, 5242880, array['image/*']),
  ('org-assets', 'org-assets', false, 5242880, array['image/*'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function app.try_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end
$$;

-- First and second folder of an object path as uuids (null when not a uuid).
create or replace function app.path_org(p_name text) returns uuid
language sql immutable as $$ select app.try_uuid((storage.foldername(p_name))[1]) $$;

create or replace function app.path_subject(p_name text) returns uuid
language sql immutable as $$ select app.try_uuid((storage.foldername(p_name))[2]) $$;

-- media ----------------------------------------------------------------------
create or replace function app.storage_media_readable(p_name text, p_owner text) returns boolean
language sql stable as $$
  select coalesce(
    app.path_org(p_name) is not null and (
      app.is_org_admin(app.path_org(p_name))
      or (p_owner = auth.uid()::text and app.is_member(app.path_org(p_name)))
      or (
        app.path_subject(p_name) is not null
        and app.child_org(app.path_subject(p_name)) = app.path_org(p_name)
        and (app.is_guardian_of(app.path_subject(p_name)) or app.can_view_child_brief(app.path_subject(p_name)))
      )
    ),
    false
  )
$$;

create or replace function app.storage_media_writable(p_name text) returns boolean
language sql stable as $$
  select coalesce(
    app.path_org(p_name) is not null
    and app.path_subject(p_name) is not null
    and app.child_org(app.path_subject(p_name)) = app.path_org(p_name)
    and (
      app.can_view_child_full(app.path_subject(p_name))
      or (app.is_guardian_of(app.path_subject(p_name)) and app.has_video_consent(app.path_subject(p_name)))
    ),
    false
  )
$$;

-- resources ------------------------------------------------------------------
create or replace function app.storage_resource_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when (storage.foldername(p_name))[1] = 'global' then true -- platform-provided generic material
    when app.path_org(p_name) is null then false
    else app.is_staff(app.path_org(p_name)) or exists (
      select 1 from public.resources r
      where r.organization_id = app.path_org(p_name) and r.url = p_name
        and app.is_member(r.organization_id)
        and (r.audience <> 'staff' or app.resource_shared_with_me(r.id))
    )
  end
$$;

-- avatars --------------------------------------------------------------------
create or replace function app.storage_avatar_readable(p_name text) returns boolean
language sql stable as $$
  select coalesce(
    app.is_member(app.path_org(p_name)) and (
      app.path_subject(p_name) = auth.uid()
      or app.can_read_profile(app.path_subject(p_name))
      or app.can_view_child_basic(app.path_subject(p_name))
    ),
    false
  )
$$;

create or replace function app.storage_avatar_writable(p_name text) returns boolean
language sql stable as $$
  select coalesce(
    app.is_member(app.path_org(p_name)) and (
      app.path_subject(p_name) = auth.uid()
      or app.is_org_admin(app.path_org(p_name))
      or (app.child_org(app.path_subject(p_name)) = app.path_org(p_name) and app.can_view_child_full(app.path_subject(p_name)))
    ),
    false
  )
$$;

-- ---------------------------------------------------------------------------
-- Policies on storage.objects (authenticated only; anon has no access)
-- ---------------------------------------------------------------------------
drop policy if exists mkt_media_select on storage.objects;
drop policy if exists mkt_media_insert on storage.objects;
drop policy if exists mkt_media_update on storage.objects;
drop policy if exists mkt_media_delete on storage.objects;
drop policy if exists mkt_resources_select on storage.objects;
drop policy if exists mkt_resources_insert on storage.objects;
drop policy if exists mkt_resources_modify on storage.objects;
drop policy if exists mkt_resources_delete on storage.objects;
drop policy if exists mkt_avatars_select on storage.objects;
drop policy if exists mkt_avatars_insert on storage.objects;
drop policy if exists mkt_avatars_update on storage.objects;
drop policy if exists mkt_avatars_delete on storage.objects;
drop policy if exists mkt_org_assets_select on storage.objects;
drop policy if exists mkt_org_assets_write on storage.objects;

create policy mkt_media_select on storage.objects for select to authenticated
  using (bucket_id = 'media' and app.storage_media_readable(name, owner_id));
create policy mkt_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and app.storage_media_writable(name));
create policy mkt_media_update on storage.objects for update to authenticated
  using (bucket_id = 'media' and (
    (owner_id = (select auth.uid())::text and app.storage_media_writable(name)) or app.is_org_admin(app.path_org(name))
  ))
  with check (bucket_id = 'media' and app.storage_media_writable(name));
create policy mkt_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (
    (owner_id = (select auth.uid())::text and app.is_member(app.path_org(name))) or app.is_org_admin(app.path_org(name))
  ));

create policy mkt_resources_select on storage.objects for select to authenticated
  using (bucket_id = 'resources' and app.storage_resource_readable(name));
create policy mkt_resources_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resources' and (
    ((storage.foldername(name))[1] = 'global' and app.is_platform_admin())
    or app.is_staff(app.path_org(name))
  ));
create policy mkt_resources_modify on storage.objects for update to authenticated
  using (bucket_id = 'resources' and (
    ((storage.foldername(name))[1] = 'global' and app.is_platform_admin())
    or app.is_org_admin(app.path_org(name))
    or (owner_id = (select auth.uid())::text and app.is_staff(app.path_org(name)))
  ))
  with check (bucket_id = 'resources' and (
    ((storage.foldername(name))[1] = 'global' and app.is_platform_admin())
    or app.is_staff(app.path_org(name))
  ));
create policy mkt_resources_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resources' and (
    ((storage.foldername(name))[1] = 'global' and app.is_platform_admin())
    or app.is_org_admin(app.path_org(name))
    or (owner_id = (select auth.uid())::text and app.is_staff(app.path_org(name)))
  ));

create policy mkt_avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and app.storage_avatar_readable(name));
create policy mkt_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and app.storage_avatar_writable(name));
create policy mkt_avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and app.storage_avatar_writable(name))
  with check (bucket_id = 'avatars' and app.storage_avatar_writable(name));
create policy mkt_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and app.storage_avatar_writable(name));

create policy mkt_org_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'org-assets' and (app.belongs_to_org(app.path_org(name)) or app.is_platform_admin()));
create policy mkt_org_assets_write on storage.objects for all to authenticated
  using (bucket_id = 'org-assets' and (app.has_role(app.path_org(name), '{school_admin}') or app.is_platform_admin()))
  with check (bucket_id = 'org-assets' and (app.has_role(app.path_org(name), '{school_admin}') or app.is_platform_admin()));

grant execute on all functions in schema app to authenticated, service_role;
