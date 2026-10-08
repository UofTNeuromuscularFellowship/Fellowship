-- ---------------------------------------------------------------------------
-- NMDx read aloud.
--
-- The nmdx-audio edge function saves the spoken version of each NMDx chapter
-- here, so a topic is voiced once and then shared by everyone who listens.
-- The bucket is private and has no policies: only the edge function (service
-- role) reads or writes it, and listeners get a short-lived signed link.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nmdx-audio', 'nmdx-audio', false, 52428800, array['audio/mpeg'])
on conflict (id) do nothing;
