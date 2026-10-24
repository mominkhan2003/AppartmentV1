-- 0010_rooms_limited_access.sql — restore the sixth bedroom and store room and
-- add a per-resident switch for hiding the financial plan. Existing residents
-- keep full access (default 1); only explicitly limited accounts lose finance.
-- MySQL 8.0+ / MariaDB compatible.

ALTER TABLE residents
  ADD COLUMN can_view_finance TINYINT(1) NOT NULL DEFAULT 1 AFTER active;

INSERT INTO spaces (id, code, name, kind, shape, capacity, notes, sort)
SELECT 's0000000-0000-4000-8000-00000000000c', 'R6', 'Room 6', 'bedroom',
       '[[488,440],[612,440],[612,525],[488,525]]', 2, NULL, 6
WHERE NOT EXISTS (SELECT 1 FROM spaces WHERE code = 'R6' OR name = 'Room 6');

INSERT INTO spaces (id, code, name, kind, shape, capacity, notes, sort)
SELECT 's0000000-0000-4000-8000-00000000000d', 'S', 'Store Room', 'storage',
       '[[390,52],[482,52],[482,78],[390,78]]', 0, 'Household storage', 9
WHERE NOT EXISTS (SELECT 1 FROM spaces WHERE code = 'S' OR kind = 'storage');
