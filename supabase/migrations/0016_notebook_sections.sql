-- Sections inside a notebook.
--
-- The ask is a subtopic level: a notebook holds sections, a section holds
-- pages. The obvious shape is a new bd_note_sections table plus a section_id on
-- bd_notes, which is two objects, a join, a second set of RLS policies, and a
-- second thing every notebook query has to know about.
--
-- A section is a notebook that lives inside another notebook. It has a name, a
-- colour, a position and a set of notes — which is bd_notebooks exactly. So
-- this is one nullable self-reference instead, and every piece of machinery
-- notebooks already have (create, rename, recolour, reorder, delete, the RLS
-- policy, the realtime publication) works on sections the day it lands.
--
-- Notes are unchanged: notebook_id already points at whichever notebook holds
-- the note, and a section is one of those.
--
-- Two rules the app relies on:
--   * the shelf lists parent_id is null, so sections never appear as notebooks
--   * on delete cascade, so removing a notebook removes its sections with it,
--     the same way removing a notebook already removes its notes

alter table public.bd_notebooks
  add column if not exists parent_id uuid
    references public.bd_notebooks(id) on delete cascade;

-- Every read is "the sections of this notebook" or "the notebooks at the top",
-- and both are this index.
create index if not exists bd_notebooks_parent_idx
  on public.bd_notebooks (user_id, parent_id, position);

-- One level, not a tree. A section that could itself hold sections turns the
-- shelf into the three-level expander this app deliberately moved away from,
-- and makes "which notebook is this in?" a walk rather than a lookup.
create or replace function public.bd_notebooks_one_level()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'a notebook cannot be its own section';
    end if;
    if exists (
      select 1 from public.bd_notebooks p
      where p.id = new.parent_id and p.parent_id is not null
    ) then
      raise exception 'sections cannot hold sections';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bd_notebooks_one_level_trg on public.bd_notebooks;
create trigger bd_notebooks_one_level_trg
  before insert or update of parent_id on public.bd_notebooks
  for each row execute function public.bd_notebooks_one_level();
