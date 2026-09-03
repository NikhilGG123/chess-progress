-- Coach rows, linking the three Supabase auth accounts to the coaches table.
--
-- NOT placeholder student data — the teardown script does NOT remove these.
-- On Wednesday, rename display_name and change the account emails/passwords in
-- the dashboard. The UUIDs stay the same, so nothing else needs to change.
--
-- Accounts were created pre-confirmed via the admin API on 2026-09-01:
--   brad@example.com / tim@example.com / spare@example.com

insert into coaches (id, display_name) values
  ('a9a43349-2e5e-4bde-933c-e282c37422a8', 'Brad'),
  ('1bab3d65-213c-4501-b844-44b201e74b85', 'Tim'),
  ('cb68d93d-7373-4f85-9730-1f6269ff5806', 'Spare')
on conflict (id) do nothing;
