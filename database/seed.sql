-- FlatMate Hub — seed data (safe defaults, no credentials).
-- Sample residents mirror the original populated flat. Site sections reproduce today's
-- homepage copy EXACTLY (English original + German translation) so enabling the CMS
-- changes nothing visually until an administrator edits content.

-- Spaces (copied from drizzle/migrations/0000 seed)
INSERT INTO spaces (id, code, name, kind, shape, capacity, notes, sort) VALUES
 (UUID(), 'R1','Room 1','bedroom','[[220,40],[390,40],[390,112],[220,112]]',1,NULL,1),
 (UUID(), 'R2','Room 2','bedroom','[[482,55],[580,55],[580,130],[482,130]]',1,NULL,2),
 (UUID(), 'R3','Room 3','bedroom','[[482,130],[580,130],[580,245],[482,245]]',1,NULL,3),
 (UUID(), 'R4','Room 4','bedroom','[[482,245],[590,245],[590,335],[482,335]]',1,NULL,4),
 (UUID(), 'R5','Room 5','bedroom','[[482,335],[595,335],[595,440],[482,440]]',1,NULL,5),
 (UUID(), 'R6','Room 6','bedroom','[[488,440],[612,440],[612,525],[488,525]]',2,NULL,6),
 (UUID(), 'K','Kitchen','kitchen','[[220,112],[390,112],[390,150],[220,150]]',0,NULL,7),
 (UUID(), 'H','Hall','hall','[[218,150],[390,150],[390,78],[482,78],[482,475],[418,475],[418,350],[218,350]]',0,NULL,8),
 (UUID(), 'S','Storage','storage','[[390,52],[482,52],[482,78],[390,78]]',0,'Currently unused',9),
 (UUID(), 'BAL','Balcony','balcony','[[80,105],[218,105],[218,350],[80,350]]',0,NULL,10),
 (UUID(), 'W','Toilet (W)','washroom','[[338,350],[418,350],[418,410],[338,410]]',0,NULL,11),
 (UUID(), 'BA','Bathroom (B)','washroom','[[330,410],[418,410],[418,475],[330,475]]',0,NULL,12),
 (UUID(), 'WB','Washroom + Bath (WB)','washroom','[[330,475],[488,475],[488,530],[330,530]]',0,NULL,13);

-- Sample residents
INSERT INTO residents (id, display_name, email, room_id, is_sample)
SELECT UUID(), v.n, v.e, s.id, 1
FROM (VALUES
 ('Anna (sample)','anna@sample.flat','Room 1'), ('Ben (sample)','ben@sample.flat','Room 2'),
 ('Clara (sample)','clara@sample.flat','Room 3'), ('David (sample)','david@sample.flat','Room 4'),
 ('Eva (sample)','eva@sample.flat','Room 5'), ('Felix (sample)','felix@sample.flat','Room 6'),
 ('Greta (sample)','greta@sample.flat','Room 6')
) v(n,e,rn) JOIN spaces s ON s.name = v.rn;

-- House groups + membership
INSERT INTO household_groups (id, name, description) VALUES
 (UUID(), 'Group A', 'Shares groceries, food and agreed common purchases'),
 (UUID(), 'Group B', 'Manages their own food and groceries');

INSERT INTO group_members (group_id, resident_id)
SELECT g.id, r.id FROM household_groups g JOIN residents r
  ON (g.name = 'Group A' AND r.email IN ('anna@sample.flat','ben@sample.flat','clara@sample.flat','david@sample.flat','eva@sample.flat'))
  OR (g.name = 'Group B' AND r.email IN ('felix@sample.flat','greta@sample.flat'));

-- Cleaning rota (mirrors the original populated flat)
INSERT INTO chores (id, name, kind, space_id, frequency_days, next_due)
SELECT UUID(), v.n, v.k, s.id, v.f, CURRENT_DATE
FROM (VALUES
 ('Hall & common areas','hall','H',7), ('Kitchen cleaning','kitchen','K',7),
 ('Garbage disposal','garbage',NULL,2), ('Toilet (W) cleaning','washroom','W',7),
 ('Bathroom (B) cleaning','washroom','BA',7), ('Washroom + Bath (WB) cleaning','washroom','WB',7)
) v(n,k,sc,f) LEFT JOIN spaces s ON s.code = v.sc;

INSERT INTO chore_members (chore_id, resident_id, position)
SELECT c.id, r.id, ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY r.email)
FROM chores c JOIN residents r
WHERE c.kind IN ('hall','kitchen','garbage') AND r.active;

UPDATE chores c SET current_resident_id = (
  SELECT cm.resident_id FROM chore_members cm JOIN residents r ON r.id = cm.resident_id
  WHERE cm.chore_id = c.id AND r.active ORDER BY cm.position LIMIT 1)
WHERE c.kind IN ('hall','kitchen','garbage') AND c.current_resident_id IS NULL;

-- Donation categories
INSERT INTO donation_categories (id, name, description, sort) VALUES
 (UUID(), 'General support', 'Covers the household commons', 1),
 (UUID(), 'Groceries', 'Buys shared staple goods', 2),
 (UUID(), 'Community kitchen', 'Funds shared cooking nights', 3),
 (UUID(), 'Repairs', 'Small repairs and consumables', 4);

-- Homepage copy — seeded to match today''s live homepage bit-for-bit.
INSERT INTO site_sections (code, area, kind, icon, sort, visible, cta_label, cta_href) VALUES
 ('hero', 'home', 'hero', 'home', 1, 1, 'Sign in', '/auth'),
 ('feature.expenses', 'home', 'feature', 'receipt', 10, 1, NULL, NULL),
 ('feature.cleaning', 'home', 'feature', 'sparkles', 20, 1, NULL, NULL),
 ('feature.issues', 'home', 'feature', 'wrench', 30, 1, NULL, NULL),
 ('feature.floorplan', 'home', 'feature', 'home', 40, 1, NULL, NULL),
 ('about', 'home', 'section', NULL, 50, 0, NULL, NULL),
 ('footer', 'footer', 'section', NULL, 90, 0, NULL, NULL);

INSERT INTO site_section_translations (section_code, locale, heading, subheading, body) VALUES
 ('hero', 'en', 'Seven people, one flat, zero spreadsheets.',
   'Everything your shared flat needs: who owes what, whose turn it is to clean, and what needs fixing.', NULL),
 ('hero', 'de', 'Sieben Menschen, eine Wohnung, null Tabellen.',
   'Alles, was eure gemeinsame Wohnung braucht: wer schuldet was, wist wann dran ist zu putzen, und was repariert werden muss.', NULL),
 ('feature.expenses', 'en', 'Fair expenses', NULL, 'Split by group or custom shares, claims reviewed by the admin.'),
 ('feature.expenses', 'de', 'Faire Ausgaben', NULL, 'Nach Gruppe oder individuellen Anteilen splitten; Ansprüche prüft die Verwaltung.'),
 ('feature.cleaning', 'en', 'Cleaning rota', NULL, 'Duties rotate automatically, with photo proof.'),
 ('feature.cleaning', 'de', 'Putzplan', NULL, 'Dienste rotieren automatisch, inklusive Fotobeweis.'),
 ('feature.issues', 'en', 'Issues', NULL, 'Report a broken tap, follow it until resolved.'),
 ('feature.issues', 'de', 'Störungen', NULL, 'Tropfenden Wasserhahn melden und mitverfolgen, bis er behoben ist.'),
 ('feature.floorplan', 'en', 'Floor plan', NULL, 'See every room and washroom in 2D or 3D.'),
 ('feature.floorplan', 'de', 'Grundriss', NULL, 'Jedes Zimmer und Bad in 2D oder 3D sehen.'),
 ('about', 'en', 'About the flat', NULL, NULL),
 ('about', 'de', 'Über die Wohngemeinschaft', NULL, NULL),
 ('footer', 'en', 'FlatMate Hub', NULL, NULL),
 ('footer', 'de', 'FlatMate Hub', NULL, NULL);

-- Starter settings (no invented data: bank fields stay empty until an admin fills them)
INSERT INTO site_settings (setting_key, setting_value) VALUES
 ('site_name', 'FlatMate Hub'),
 ('default_locale', 'en'),
 ('social_instagram_url', ''),
 ('donations_account', ''),
 ('donations_instructions', ''),
 ('donations_goal', ''),
 -- Donation area stays OFF by default so the approved homepage design shows the
 -- exact pre-CMS visuals; admins opt in from Donations → Settings.
 ('donations_public', '0');
