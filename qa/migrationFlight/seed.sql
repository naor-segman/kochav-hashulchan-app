-- Production-like data that the MAIN schema (40 migrations) allows.
-- Users: A (host), B (host), C (host, lapsed), D (admin)
insert into auth.users (id, email) values
 ('aaaaaaaa-0000-0000-0000-00000000000a', 'a@x.test'),
 ('bbbbbbbb-0000-0000-0000-00000000000b', 'b@x.test'),
 ('cccccccc-0000-0000-0000-00000000000c', 'c@x.test'),
 ('dddddddd-0000-0000-0000-00000000000d', 'admin@x.test');
update public.profiles set role = 'admin' where id = 'dddddddd-0000-0000-0000-00000000000d';
update public.profiles set full_name = 'דנה כהן', stripe_customer_id = 'cus_A' where id = 'aaaaaaaa-0000-0000-0000-00000000000a';

-- E1: full modern wedding, A
insert into public.events (id, user_id, name, type, date, venue, guest_count, table_count, seated_pct, version,
  rsvp_token, invite_token, gift_token, hostess_token, collab_token, payload) values
('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'החתונה של דנה ויוסי', 'חתונה', '2026-11-05', 'אולמי הגן',
 9, 2, 55.5, 7, 'rsvpE1aaaaaa', 'invE1aaaaaaa', 'giftE1aaaaaa', 'hostE1aaaaaa', 'collE1aaaaaa',
 jsonb_build_object(
  'localId', 'loc-e1', 'brideName', 'דנה', 'groomName', 'יוסי', 'coupleType', 'bride-groom', 'parentsType', 'mother-father',
  'customGroups', '["חברים מהצבא","השכנים מהבניין"]'::jsonb,
  'albumToken', 'albE1aaaaaaaa',
  'tokens', '{"rsvp":"rsvpE1aaaaaa","invite":"invE1aaaaaaa","gift":"giftE1aaaaaa","hostess":"hostE1aaaaaa","collab":"collE1aaaaaa","album":"albE1aaaaaaaa"}'::jsonb,
  'eventSite', '{"enabled":true,"contactPhone":"050-1234567","rsvpMessage":"נשמח לראותכם","shuttles":[{"id":"s1","label":"מתל אביב"}],"schedule":[{"t":"19:00","l":"קבלת פנים"}],"sections":{"map":true},"coverPhoto":{"path":"e1/cover.jpg"}}'::jsonb,
  'announcements', '{"saveTheDate":{"enabled":true,"text":"שמרו"},"invitation":{"enabled":false,"text":"טיוטה"}}'::jsonb,
  'guests', '[
     {"id":"g1","name":"משפחת לוי","count":4,"arrivedSeats":[0,2],"arrived":true,"arrivedAt":1790000000000},
     {"id":"g2","name":"סבתא רחל","count":1,"arrived":true},
     {"id":"g3","name":"משפחת כהן","count":"3"},
     {"id":"g4","name":"חבר","count":null,"arrived":false},
     {"id":"g5","name":"זוג","count":2,"arrivedSeats":["1"],"arrived":true}
   ]'::jsonb,
  'tables', '[{"id":"t1","name":"1","capacity":10},{"id":"t2","name":"2","capacity":12}]'::jsonb,
  'seating', '{"g1":"t1","g2":"t1"}'::jsonb,
  'photoRetentionDays', 30));

-- E2: A, empty payload (created before payload fields existed), no tokens at all
insert into public.events (id, user_id, name, payload) values
('e2000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 'טיוטה', '{}'::jsonb);

-- E3: B, bar mitzvah, legacy customGroups as object, site disabled, album token, collab inactive
insert into public.events (id, user_id, name, type, rsvp_token, invite_token, gift_token, hostess_token, collab_token, payload) values
('e3000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-00000000000b', 'בר המצווה של נועם', 'בר מצווה',
 'rsvpE3bbbbbb', 'invE3bbbbbbb', 'giftE3bbbbbb', 'hostE3bbbbbb', 'collE3bbbbbb',
 '{"localId":"loc-e3","celebrantName":"נועם","customGroups":{"a":"x"},"albumToken":"albE3bbbbbbbb","eventSite":{"enabled":false,"contactPhone":"052-0000000","rsvpMessage":"בואו"},"collabActive":false,"hostessWriteActive":false,"guests":[{"id":"h1","count":2}]}'::jsonb);

-- E4: B, pre-20260716 row: token COLUMNS null, tokens only in payload
insert into public.events (id, user_id, name, payload) values
('e4000000-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-00000000000b', 'ישן', '{"localId":"loc-e4","tokens":{"rsvp":"oldrsvp4444","album":"albE4bbbbbbbb"},"albumToken":"albE4bbbbbbbb","customGroups":"not-an-array"}'::jsonb);

-- E5: C, albumToken as a JSON number, albumToken null variant elsewhere
insert into public.events (id, user_id, name, gift_token, payload) values
('e5000000-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-00000000000c', 'ברית', 'giftE5cccccc', '{"albumToken":123456789,"guests":"oops"}'::jsonb),
('e6000000-0000-0000-0000-000000000006', 'cccccccc-0000-0000-0000-00000000000c', 'חינה', null, '{"albumToken":null}'::jsonb);

-- gifts: legacy ₪5..₪49.99 rows (allowed by main's CHECK 500..10M), hidden, paid, long messages, twins
insert into public.gifts (event_id, donor_name, amount, message, paid, hidden, created_at) values
('e1000000-0000-0000-0000-000000000001', 'משפחת כהן', 500, 'מזל טוב', false, false, now() - interval '30 days'),
('e1000000-0000-0000-0000-000000000001', 'פוגעני', 1000, 'הודעה פוגענית', false, true, now() - interval '29 days'),
('e1000000-0000-0000-0000-000000000001', 'משפחת כהן', 4999, null, false, false, now() - interval '5 days'),
('e1000000-0000-0000-0000-000000000001', 'משפחת לוי', 36000, repeat('א', 1000), true, false, now() - interval '2 days'),
('e1000000-0000-0000-0000-000000000001', 'משפחת לוי', 36000, repeat('א', 1000), true, false, now() - interval '2 days'),
('e1000000-0000-0000-0000-000000000001', 'עשיר', 10000000, 'מקסימום', false, false, now() - interval '1 day'),
('e3000000-0000-0000-0000-000000000003', 'דוד', 18000, 'לחיים', false, false, now() - interval '3 hours'),
('e5000000-0000-0000-0000-000000000005', 'x', 5000, '', false, false, now());

-- album photos
insert into public.album_photos (event_id, album_token, storage_path, uploader, created_at) values
('e1000000-0000-0000-0000-000000000001', 'albE1aaaaaaaa', 'e1000000-0000-0000-0000-000000000001/a.jpg', 'אורח', now() - interval '1 day'),
('e1000000-0000-0000-0000-000000000001', 'albE1aaaaaaaa', 'e1000000-0000-0000-0000-000000000001/b.jpg', null, now()),
('e3000000-0000-0000-0000-000000000003', 'albE3bbbbbbbb', 'e3000000-0000-0000-0000-000000000003/c.jpg', 'דוד', now());

-- subscriptions: every shape the old schema allows
insert into public.subscriptions (user_id, plan, status, started_at, expires_at, is_manually_managed, stripe_subscription_id, stripe_customer_id, current_period_end, payment_past_due) values
('aaaaaaaa-0000-0000-0000-00000000000a', 'pro',        'active',    now() - interval '10 days', null,                        true,  null,     null,    null, false), -- admin comp, flagged
('bbbbbbbb-0000-0000-0000-00000000000b', 'pro',        'active',    now() - interval '20 days', null,                        false, null,     null,    null, false), -- comp by SQL per 20260524 instructions (flag default false)
('cccccccc-0000-0000-0000-00000000000c', 'pro',        'expired',   now() - interval '400 days', now() - interval '35 days', false, null,     null,    null, false),
('cccccccc-0000-0000-0000-00000000000c', 'free',       'cancelled', now() - interval '500 days', null,                       false, null,     null,    null, false),
('dddddddd-0000-0000-0000-00000000000d', 'enterprise', 'trialing',  now() - interval '3 days',  now() + interval '11 days',  false, 'sub_1X', 'cus_D', now() + interval '11 days', true);

-- rsvp / collab / submissions
insert into public.rsvp_responses (event_id, guest_name, phone, attending, guests_count, status, companions, shuttle_id, meal) values
('e1000000-0000-0000-0000-000000000001', 'רון', '0501111111', true, 3, 'yes', '["א","ב"]', 's1', 'צמחוני'),
('e1000000-0000-0000-0000-000000000001', 'מיכל', null, false, 0, 'no', '[]', null, null),
('e1000000-0000-0000-0000-000000000001', 'legacy', null, true, 1, null, '[]', null, null);
insert into public.collab_guests (id, event_id, name, phone, side, guest_group, guests_count, companions, notes, updated_by) values
(gen_random_uuid(), 'e1000000-0000-0000-0000-000000000001', 'דוד', '050', 'bride', 'חברים מהצבא', 2, '[]', 'הערה', 'אמא');
insert into public.guest_submissions (event_id, name, phone, side, guest_group, guests_count, submitted_by) values
('e1000000-0000-0000-0000-000000000001', 'שרה', '052', 'groom', 'משפחה', 1, 'אבא');

insert into public.error_reports (user_id, message, stack, route, user_agent, kind) values
('aaaaaaaa-0000-0000-0000-00000000000a', 'TypeError', 'at x', '/events/:id', 'UA', 'render'),
(null, 'chunk 404', null, '/', 'UA', 'global');
insert into public.feedback (user_id, kind, message, contact, route) values
('bbbbbbbb-0000-0000-0000-00000000000b', 'bug', 'לא עובד', 'b@x.test', '/'),
(null, 'other', 'אנונימי', null, '/pricing');
insert into public.ai_usage (user_id, kind, created_at) values
('aaaaaaaa-0000-0000-0000-00000000000a', 'detect-floor-plan', now() - interval '2 days');
insert into public.templates (name, type, payload, icon, sort_order) values ('חתונה סטנדרטית', 'חתונה', '{}', 'ring', 1);
insert into storage.objects (bucket_id, name) values
('event-album', 'e1000000-0000-0000-0000-000000000001/a.jpg'),
('event-album', 'e1000000-0000-0000-0000-000000000001/b.jpg');
