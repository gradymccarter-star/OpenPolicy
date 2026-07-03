-- Incumbent/challenger distinction for PA Chamber Endorsement Tool
-- Run this in Supabase SQL editor (Dashboard -> SQL Editor -> Run)

ALTER TABLE politicians
  ADD COLUMN IF NOT EXISTS candidacy_status TEXT
    CHECK (candidacy_status IN ('incumbent', 'challenger'))
    DEFAULT 'incumbent',
  ADD COLUMN IF NOT EXISTS data_source TEXT
    CHECK (data_source IN ('legiscan', 'candidate_filing'))
    DEFAULT 'legiscan';

-- Backfill existing rows explicitly (all current rows came from LegiScan's sitting-member feed)
UPDATE politicians SET candidacy_status = 'incumbent', data_source = 'legiscan'
  WHERE candidacy_status IS NULL OR data_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_politicians_candidacy_status ON politicians(candidacy_status);
