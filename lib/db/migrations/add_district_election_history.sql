-- Historical PA House general election results, by district and cycle
-- Source: openelections-data-pa (precinct-level results aggregated to district)
-- Run this in Supabase SQL editor (Dashboard -> SQL Editor -> Run)

CREATE TABLE IF NOT EXISTS district_election_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  district VARCHAR(10) NOT NULL,
  election_year INT NOT NULL CHECK (election_year BETWEEN 2000 AND 2030),
  office_type VARCHAR(20) NOT NULL CHECK (office_type IN ('pa_house', 'pa_senate', 'governor')),

  dem_votes INT NOT NULL DEFAULT 0,
  rep_votes INT NOT NULL DEFAULT 0,
  other_votes INT NOT NULL DEFAULT 0,
  winner_party CHAR(1) CHECK (winner_party IN ('D', 'R', 'I')),

  source TEXT DEFAULT 'openelections-data-pa',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(district, election_year, office_type)
);

CREATE INDEX IF NOT EXISTS idx_district_history_district ON district_election_history(district);
CREATE INDEX IF NOT EXISTS idx_district_history_year ON district_election_history(election_year);
