-- Minutes of focus logged against a task from the Focus widget.
alter table public.sorro_tasks add column if not exists focus_minutes integer not null default 0 check (focus_minutes >= 0);
