-- Data the production schema allows (or could hold) that the pending files choke on.
-- (1) two events sharing an album token (a copied payload), and two with '' tokens
update public.events set payload = payload || '{"albumToken":"albE1aaaaaaaa"}' where id = 'e6000000-0000-0000-0000-000000000006';
insert into public.events (user_id, name, payload) values
 ('cccccccc-0000-0000-0000-00000000000c', 'ריק1', '{"albumToken":""}'),
 ('cccccccc-0000-0000-0000-00000000000c', 'ריק2', '{"albumToken":""}');
-- (2) an album token too big for a btree entry (random, incompressible)
insert into public.events (user_id, name, payload)
select 'cccccccc-0000-0000-0000-00000000000c', 'ענק',
       jsonb_build_object('albumToken', (select string_agg(md5(random()::text || i), '') from generate_series(1, 150) i));
-- (3) a project whose gift CHECK was the NOT VALID ₪50 one from 20260811030000
--     (built from the old hand-kept setup_full.sql), so an older ₪1 row exists
alter table public.gifts drop constraint ck_gift_amount_range;
insert into public.gifts (event_id, donor_name, amount) values ('e1000000-0000-0000-0000-000000000001', 'ישן', 100);
alter table public.gifts add constraint ck_gift_amount_range check (amount >= 5000 and amount <= 10000000) not valid;
-- (4) door shapes the hostess RPC cannot parse
update public.events set payload = jsonb_set(payload, '{guests}', payload->'guests' ||
  '[{"id":"g7","count":2,"arrived":1790000000000},{"id":"g8","count":2.5}]'::jsonb)
 where id = 'e1000000-0000-0000-0000-000000000001';
update public.events set payload = payload || '{"guests":"oops"}', hostess_token = 'hostE5cccccc' where id = 'e5000000-0000-0000-0000-000000000005';
-- (5) an object the pending files REVOKE on is missing
drop function public.prune_ai_usage();
-- 30.9: a phone CHECK under a hand-given name, and a leftover permissive album upload policy.
alter table public.collab_guests add constraint collab_phone_short check (phone is null or char_length(phone) <= 20);
create policy album_upload_any on storage.objects for insert to anon with check (bucket_id = 'event-album');
