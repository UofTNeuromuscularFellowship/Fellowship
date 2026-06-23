-- =====================================================================
-- Seed data — City Wide Neuromuscular Fellowship Portal
-- Source: Citywide_NM_teaching_202627.pdf  +  NM_FELLOW_JULYAUG2026.pdf
-- NOTE: Clinic site codes (AI SHSC, CK SMH, CTB TGH, SMA - SHSC, SICK KIDS,
--       PROTECTED) are transcribed VERBATIM from the program calendar.
--       The code legend (which physician / which site) is to be confirmed
--       by the program before it is displayed as expanded labels.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Teaching sessions — Thursdays 08:00–09:00, 2026-27
-- ---------------------------------------------------------------------
insert into teaching_sessions (session_date, topic, provider_name, is_break, break_label) values
  ('2026-07-09', null, null, false, null),
  ('2026-07-16', 'EMG Basics — Spontaneous and Voluntary Activity', 'Aaron Izenberg', false, null),
  ('2026-07-23', 'EMG Report Writing', 'Aaron Izenberg', false, null),
  ('2026-07-30', 'Waveform Rounds', 'Charles Kassardjian', false, null),
  ('2026-08-06', 'Journal Club', 'Fellow', false, null),
  ('2026-08-13', 'Focal Neuropathies', 'Peter Broadhurst', false, null),
  ('2026-08-20', 'Waveform Rounds', 'Corey Bacher', false, null),
  ('2026-08-27', 'Radiculopathies and Plexopathies', 'Peter Broadhurst', false, null),
  ('2026-09-03', null, null, false, null),
  ('2026-09-10', 'Idiopathic Inflammatory Myopathies: classification, diagnosis, management', 'Charles Kassardjian', false, null),
  ('2026-09-17', 'Waveform Rounds', 'Aaron Izenberg', false, null),
  ('2026-09-24', 'Toxic and Other Acquired Myopathies', 'Charles Kassardjian', false, null),
  ('2026-10-01', null, null, true, 'AANEM'),
  ('2026-10-08', 'A primer on Muscle Histopathology', 'Charles Kassardjian', false, null),
  ('2026-10-15', 'Waveform Rounds', 'Aaron Izenberg', false, null),
  ('2026-10-22', 'Journal Club', 'Fellow', false, null),
  ('2026-10-29', 'Hereditary Myopathies', 'Charles Kassardjian', false, null),
  ('2026-11-05', 'GBS and other acute neuropathies', 'Ario Mirian', false, null),
  ('2026-11-12', 'CIDP and other chronic inflammatory neuropathies', 'Ario Mirian', false, null),
  ('2026-11-19', 'Waveform Rounds', 'Corey Bacher', false, null),
  ('2026-11-26', 'Traumatic Neuropathy', 'Peter Broadhurst', false, null),
  ('2026-12-03', 'Imaging in neuromuscular disease', 'Thiru Sivakumaran', false, null),
  ('2026-12-10', 'Hereditary and Toxic Neuropathies', 'Aaron Izenberg', false, null),
  ('2026-12-17', null, null, true, 'Winter Break'),
  ('2026-12-24', null, null, true, 'Winter Break'),
  ('2026-12-31', null, null, true, 'Winter Break'),
  ('2027-01-07', 'Small Fibre Neuropathy', null, false, null),
  ('2027-01-14', 'A primer on Nerve Histopathology', 'Gyl Midroni', false, null),
  ('2027-01-21', 'Waveform Rounds', 'Aaron Izenberg', false, null),
  ('2027-01-28', 'Myasthenia Gravis: classification, diagnosis and treatment', 'Corey Bacher', false, null),
  ('2027-02-04', 'Other NMJ disorders', 'Carolina Barnett Tapia', false, null),
  ('2027-02-11', 'Waveform Rounds', 'Charles Kassardjian', false, null),
  ('2027-02-18', 'Journal Club', 'Fellow', false, null),
  ('2027-02-25', 'Respiratory weakness in Neuromuscular Disease', 'Anu Tandon', false, null),
  ('2027-03-04', null, null, false, null),
  ('2027-03-11', null, null, true, 'March Break'),
  ('2027-03-18', null, null, true, 'March Break'),
  ('2027-03-25', 'Journal Club', 'Fellow', false, null),
  ('2027-04-01', 'Waveform Rounds', 'Charles Kassardjian', false, null),
  ('2027-04-08', 'Amyotrophic Lateral Sclerosis', 'Aaron Izenberg', false, null),
  ('2027-04-15', 'Waveform Rounds', 'Corey Bacher', false, null),
  ('2027-04-22', 'SMA and other motor neuron diseases', 'Aaron Izenberg', false, null),
  ('2027-04-29', 'Waveform Rounds', 'Charles Kassardjian', false, null),
  ('2027-05-06', 'Waveform Rounds', 'Aaron Izenberg', false, null),
  ('2027-05-13', 'Waveform Rounds', 'Aaron Izenberg', false, null),
  ('2027-05-20', 'Journal Club', 'Fellow', false, null),
  ('2027-05-27', 'Waveform Rounds', 'Charles Kassardjian', false, null),
  ('2027-06-03', 'Waveform Rounds', 'Corey Bacher', false, null),
  ('2027-06-10', 'Waveform Rounds', 'Aaron Izenberg', false, null),
  ('2027-06-17', null, null, false, null),
  ('2027-06-24', null, null, false, null);

-- Topic -> default provider (derived from the grid; one row per distinct topic)
insert into topic_provider_defaults (topic, default_provider_name) values
  ('EMG Basics — Spontaneous and Voluntary Activity', 'Aaron Izenberg'),
  ('EMG Report Writing', 'Aaron Izenberg'),
  ('Waveform Rounds', null),
  ('Journal Club', 'Fellow'),
  ('Focal Neuropathies', 'Peter Broadhurst'),
  ('Radiculopathies and Plexopathies', 'Peter Broadhurst'),
  ('Idiopathic Inflammatory Myopathies: classification, diagnosis, management', 'Charles Kassardjian'),
  ('Toxic and Other Acquired Myopathies', 'Charles Kassardjian'),
  ('A primer on Muscle Histopathology', 'Charles Kassardjian'),
  ('Hereditary Myopathies', 'Charles Kassardjian'),
  ('GBS and other acute neuropathies', 'Ario Mirian'),
  ('CIDP and other chronic inflammatory neuropathies', 'Ario Mirian'),
  ('Traumatic Neuropathy', 'Peter Broadhurst'),
  ('Imaging in neuromuscular disease', 'Thiru Sivakumaran'),
  ('Hereditary and Toxic Neuropathies', 'Aaron Izenberg'),
  ('Small Fibre Neuropathy', null),
  ('A primer on Nerve Histopathology', 'Gyl Midroni'),
  ('Myasthenia Gravis: classification, diagnosis and treatment', 'Corey Bacher'),
  ('Other NMJ disorders', 'Carolina Barnett Tapia'),
  ('Respiratory weakness in Neuromuscular Disease', 'Anu Tandon'),
  ('Amyotrophic Lateral Sclerosis', 'Aaron Izenberg'),
  ('SMA and other motor neuron diseases', 'Aaron Izenberg')
on conflict (topic) do nothing;

-- ---------------------------------------------------------------------
-- Clinic rotations — July & August 2026
-- fellow_label holds the raw first name from the grid; a director links
-- these to real user accounts after fellows are onboarded.
-- ---------------------------------------------------------------------
insert into clinic_rotations (fellow_label, rotation_date, site_code, is_protected) values
  -- Paula — July
  ('Paula','2026-07-13','AI SHSC',false),('Paula','2026-07-14','CK SMH',false),('Paula','2026-07-15','AI SHSC',false),('Paula','2026-07-16','CK SMH',false),('Paula','2026-07-17','PROTECTED',true),
  ('Paula','2026-07-20','AI SHSC',false),('Paula','2026-07-21','CK SMH',false),('Paula','2026-07-22','AI SHSC',false),('Paula','2026-07-23','PROTECTED',true),('Paula','2026-07-24','SMA - SHSC',false),
  ('Paula','2026-07-27','AI SHSC',false),('Paula','2026-07-28','CK SMH',false),('Paula','2026-07-29','AI SHSC',false),('Paula','2026-07-30','CK SMH',false),('Paula','2026-07-31','PROTECTED',true),
  -- Paula — August
  ('Paula','2026-08-03','AI SHSC',false),('Paula','2026-08-04','CK SMH',false),('Paula','2026-08-05','AI SHSC',false),('Paula','2026-08-06','CK SMH',false),('Paula','2026-08-07','PROTECTED',true),
  ('Paula','2026-08-10','AI SHSC',false),('Paula','2026-08-11','SICK KIDS',false),('Paula','2026-08-12','AI SHSC',false),('Paula','2026-08-13','CK SMH',false),('Paula','2026-08-14','PROTECTED',true),
  ('Paula','2026-08-17','AI SHSC',false),('Paula','2026-08-18','CK SMH',false),('Paula','2026-08-19','AI SHSC',false),('Paula','2026-08-20','CK SMH',false),('Paula','2026-08-21','PROTECTED',true),
  ('Paula','2026-08-25','CK SMH',false),('Paula','2026-08-27','CK SMH',false),('Paula','2026-08-28','PROTECTED',true),
  ('Paula','2026-08-31','AI SHSC',false),
  -- Manal — July
  ('Manal','2026-07-13','AI SHSC',false),('Manal','2026-07-14','CB-SHSC',false),('Manal','2026-07-15','CTB TGH',false),('Manal','2026-07-16','CK SMH',false),('Manal','2026-07-17','PROTECTED',true),
  ('Manal','2026-07-20','AI SHSC',false),('Manal','2026-07-21','SICK KIDS',false),('Manal','2026-07-23','PROTECTED',true),('Manal','2026-07-24','SMA - SHSC',false),
  ('Manal','2026-07-27','AI SHSC',false),('Manal','2026-07-28','CB-SHSC',false),('Manal','2026-07-30','CK SMH',false),('Manal','2026-07-31','PROTECTED',true),
  -- Manal — August
  ('Manal','2026-08-03','AI SHSC',false),('Manal','2026-08-04','CB SHSC',false),('Manal','2026-08-05','CTB TGH',false),('Manal','2026-08-06','PROTECTED',true),('Manal','2026-08-07','SMA - SHSC',false),
  ('Manal','2026-08-10','AI SHSC',false),('Manal','2026-08-11','CK SMH',false),('Manal','2026-08-12','CTB TGH',false),('Manal','2026-08-13','CK SMH',false),('Manal','2026-08-14','PROTECTED',true),
  ('Manal','2026-08-17','AI SHSC',false),('Manal','2026-08-18','CB SHSC',false),('Manal','2026-08-19','CTB TGH',false),('Manal','2026-08-20','CK SMH',false),('Manal','2026-08-21','PROTECTED',true),
  ('Manal','2026-08-25','SICK KIDS',false),('Manal','2026-08-26','CTB TGH',false),('Manal','2026-08-27','CK SMH',false),('Manal','2026-08-28','PROTECTED',true),
  ('Manal','2026-08-31','AI SHSC',false);

-- A starter handbook page (replace body with content from neuromuscularto.ca handbook)
insert into handbook_pages (slug, title, body_md, sort_order) values
  ('overview', 'Program Overview',
   E'# City Wide Neuromuscular Fellowship\n\n_Content to be imported from the program handbook (neuromuscularto.ca). This is a placeholder._', 0)
on conflict (slug) do nothing;
