-- Attachments on a message.
--
-- Four columns rather than a table: an attachment has no life of its own, it
-- is deleted with its message and it is never queried except through one.
--
-- **Why the object lives in `bd-feed` and not `bd-files`.** Storage RLS on
-- `bd-files` is `(storage.foldername(name))[1] = auth.uid()` for every command,
-- so nobody but the owner can even sign a URL for one of those objects — a
-- file attached by reference would render as a broken card for every recipient
-- and work perfectly for the person who sent it, which is the worst kind of
-- bug. `bd-feed` already carries "things other people are meant to see": its
-- write policy is owner-scoped and its read policy is `bucket_id = 'bd-feed'`.
--
-- So sending a file from your Drive *copies* the object into `bd-feed`. That
-- is deliberate and it is the honest option: the alternative is widening the
-- read policy on the whole of `bd-files`, which would hand every signed-in
-- account the keys to everybody's private documents to save one round trip.
--
-- `attach_kind` mirrors `bd_files.kind` ('image' renders inline, anything else
-- is a card with a name and a size).

alter table public.bd_messages add column if not exists attach_path text;
alter table public.bd_messages add column if not exists attach_name text;
alter table public.bd_messages add column if not exists attach_kind text;
alter table public.bd_messages add column if not exists attach_size bigint;
