-- A folder gets a face, and a project gets a cover.
--
-- Two text columns rather than two tables: an icon and a cover have no life
-- apart from the project they belong to, nothing ever queries "all projects
-- with this icon", and a join to read a folder grid would be a round trip per
-- screen for two strings.
--
-- `icon` holds one of three things, told apart by shape and read by
-- `components/projects/Look.tsx`:
--   ''                     the drawn folder, as before
--   'ic:proj'              a built-in Icon name from components/Icon.tsx
--   '<uid>/…'              a storage path in bd-files, for an uploaded picture
--   anything else          an emoji, taken literally
--
-- `cover` holds a preset gradient id ('grad:dusk') or a storage path, the same
-- way. A default of '' everywhere means every existing row keeps the look it
-- has and nothing has to be backfilled.

alter table public.bd_projects
  add column if not exists icon  text not null default '',
  add column if not exists cover text not null default '';

-- Long enough for a storage path, short enough that nobody can stuff a data URI
-- in here and make the folder grid megabytes.
alter table public.bd_projects
  drop constraint if exists bd_projects_icon_len,
  add constraint bd_projects_icon_len check (char_length(icon) <= 300);

alter table public.bd_projects
  drop constraint if exists bd_projects_cover_len,
  add constraint bd_projects_cover_len check (char_length(cover) <= 300);
