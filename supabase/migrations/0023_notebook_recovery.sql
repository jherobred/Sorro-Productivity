-- A notebook in the bin keeps every page, including pages binned earlier.
-- Restoring the notebook reveals its live pages; previously binned pages stay binned.
alter table public.bd_notebooks add column if not exists deleted_at timestamptz;
create index if not exists bd_notebooks_live_idx on public.bd_notebooks(user_id, deleted_at);
