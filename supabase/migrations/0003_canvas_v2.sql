-- Canvas v2, graph views, and journal photos that can be archived.
--
-- Three things, all of them things the UI already tried to do and the schema
-- refused:
--
-- 1. `bd_canvas_nodes.kind` allowed ('hub','note','flag','muted') — names from
--    a scratch-board that no longer exists. The canvas writes 'text' and
--    'group', so *every* card insert failed the check constraint. Production
--    has two canvases and zero nodes, which is what that looks like from the
--    outside: cards that appear, then vanish on the refetch.
--
-- 2. A saved graph view needs a name, a colour and a remembered viewport, which
--    is exactly a `bd_canvases` row. Rather than a second table that is a copy
--    of this one, a canvas row now says which kind it is.
--
-- 3. Journal photos could only be destroyed. Archive and undo both need the
--    row to survive the gesture, so they get the two timestamps every other
--    soft-deletable table in this schema uses.

-- 1. Card kinds the canvas actually writes -----------------------------------

alter table public.bd_canvas_nodes drop constraint if exists bd_canvas_nodes_kind_check;

update public.bd_canvas_nodes
   set kind = 'text'
 where kind not in ('text', 'note', 'canvas', 'group');

alter table public.bd_canvas_nodes
  add constraint bd_canvas_nodes_kind_check
  check (kind in ('text', 'note', 'canvas', 'group'));

alter table public.bd_canvas_nodes alter column kind set default 'text';

-- A card can embed another canvas, the way Obsidian nests one canvas in the
-- next. ON DELETE SET NULL rather than CASCADE: deleting a board must not
-- silently delete cards on other boards that pointed at it.
alter table public.bd_canvas_nodes
  add column if not exists ref_canvas uuid references public.bd_canvases(id) on delete set null;

create index if not exists bd_canvas_nodes_canvas_idx on public.bd_canvas_nodes (canvas_id);
create index if not exists bd_canvas_edges_canvas_idx on public.bd_canvas_edges (canvas_id);

-- 2. A canvas row is a board or a saved graph view ---------------------------

alter table public.bd_canvases add column if not exists kind text not null default 'canvas';
alter table public.bd_canvases drop constraint if exists bd_canvases_kind_check;
alter table public.bd_canvases add constraint bd_canvases_kind_check check (kind in ('canvas', 'graph'));

-- Which sources a graph view draws, and how hard its springs pull. Free-form
-- because the graph's controls are still moving; nothing else reads it.
alter table public.bd_canvases add column if not exists settings jsonb not null default '{}'::jsonb;

-- 3. Journal photos: archive, and delete you can take back -------------------

alter table public.bd_journal_photos add column if not exists archived_at timestamptz;
alter table public.bd_journal_photos add column if not exists deleted_at   timestamptz;

create index if not exists bd_journal_photos_entry_idx on public.bd_journal_photos (entry_id, position);
