-- Capitol/district office contact info and committee assignments, scraped from
-- the PA General Assembly member bio pages (palegis.us). Incumbents only — no
-- official source exists for non-incumbent challengers.
-- Run this in Supabase SQL editor (Dashboard -> SQL Editor -> Run)

ALTER TABLE politicians
  ADD COLUMN IF NOT EXISTS capitol_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS capitol_address TEXT,
  ADD COLUMN IF NOT EXISTS district_office_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS district_office_address TEXT,
  ADD COLUMN IF NOT EXISTS committee_assignments JSONB DEFAULT '[]';
