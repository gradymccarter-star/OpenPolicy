-- Campaign Finance tables for PA Chamber Endorsement Tool
-- Run this in Supabase SQL editor (Dashboard → SQL Editor → Run)

-- Donor organization lean classification
CREATE TABLE IF NOT EXISTS donor_organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  lean TEXT CHECK (lean IN ('pro_chamber', 'anti_chamber', 'neutral', 'unknown')) DEFAULT 'unknown',
  industry TEXT,
  lean_rationale TEXT,
  lean_classified_by TEXT CHECK (lean_classified_by IN ('manual', 'llm', 'rule')) DEFAULT 'rule',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual contributions and organizational/PAC contributions
CREATE TABLE IF NOT EXISTS campaign_contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  donor_org_id UUID REFERENCES donor_organizations(id),

  donor_name TEXT NOT NULL,
  donor_type TEXT NOT NULL CHECK (donor_type IN ('individual', 'organization', 'pac', 'party', 'other')),
  amount DECIMAL(12, 2) NOT NULL,
  contribution_date DATE,
  cycle_year INT NOT NULL CHECK (cycle_year BETWEEN 2018 AND 2030),

  -- Source tracking
  followthemoney_id TEXT,
  source TEXT DEFAULT 'followthemoney',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(followthemoney_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contributions_politician ON campaign_contributions(politician_id);
CREATE INDEX IF NOT EXISTS idx_contributions_cycle ON campaign_contributions(cycle_year);
CREATE INDEX IF NOT EXISTS idx_contributions_donor_org ON campaign_contributions(donor_org_id);
CREATE INDEX IF NOT EXISTS idx_contributions_amount ON campaign_contributions(amount DESC);
CREATE INDEX IF NOT EXISTS idx_donor_orgs_lean ON donor_organizations(lean);
CREATE INDEX IF NOT EXISTS idx_donor_orgs_normalized ON donor_organizations(normalized_name);

-- Auto-update updated_at on donor_organizations
CREATE OR REPLACE FUNCTION update_donor_orgs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_donor_organizations_updated_at ON donor_organizations;
CREATE TRIGGER update_donor_organizations_updated_at
  BEFORE UPDATE ON donor_organizations
  FOR EACH ROW EXECUTE FUNCTION update_donor_orgs_updated_at();
