-- What a person is, beyond a name and a note.
--
-- bd_people has carried name, category, colour, email and note since the base
-- schema. The contact card wants four more things: a face, the places they
-- exist online, their Basedly handle, and pictures of them.
--
-- Links and gallery are jsonb rather than two more tables. They are short,
-- ordered, always read whole with the person, and never queried across people
-- — "which of my contacts has a Twitter" is not a question this app asks. A
-- table for each would buy a join and two more RLS policies to answer nothing.
--
-- Photos are storage paths in bd-files, not URLs. The bucket is private, so a
-- URL would be a signed link that expires; the path is the durable thing and
-- lib/uploads.ts signs it on read.

alter table public.bd_people
  add column if not exists photo_path text,
  -- [{ "label": "Instagram", "url": "https://..." }]
  add column if not exists links jsonb not null default '[]'::jsonb,
  -- [{ "path": "<uid>/<uuid>-name.jpg", "kind": "image" | "video" }]
  add column if not exists gallery jsonb not null default '[]'::jsonb,
  add column if not exists basedly_handle text;

-- Both columns are read as arrays and iterated on render. A row where they are
-- objects or scalars would not throw at the database and would throw in the
-- browser, one person at a time, with no clue where it came from.
alter table public.bd_people
  drop constraint if exists bd_people_links_is_array;
alter table public.bd_people
  add constraint bd_people_links_is_array
  check (jsonb_typeof(links) = 'array');

alter table public.bd_people
  drop constraint if exists bd_people_gallery_is_array;
alter table public.bd_people
  add constraint bd_people_gallery_is_array
  check (jsonb_typeof(gallery) = 'array');
