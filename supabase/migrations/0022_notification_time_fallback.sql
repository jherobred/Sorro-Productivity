-- A Canvas announcement with no posted time took the whole sync down.
--
-- Canvas leaves `posted_at` null on an announcement that is scheduled but not
-- yet released. The deployed `sync` Edge Function copies it straight into
-- bd_notifications.created_at, which is NOT NULL, and an explicit null skips
-- the column default, so one such announcement failed every sync with
-- "null value in column created_at violates not-null constraint". The function
-- in the repo already falls back to the current time, but the deployed copy
-- predates that fix and cannot be redeployed from here, so the table fills the
-- gap itself: a missing time becomes the moment the row arrives.

create or replace function public.bd_notifications_fill_created_at()
returns trigger
language plpgsql
as $$
begin
  if new.created_at is null then
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists bd_notifications_fill_created_at on public.bd_notifications;

create trigger bd_notifications_fill_created_at
  before insert on public.bd_notifications
  for each row execute function public.bd_notifications_fill_created_at();
