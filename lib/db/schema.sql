-- PA Chamber of Commerce Endorsement Intelligence - Database Schema
-- PostgreSQL Schema for Supabase

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Politicians (PA House candidates)
CREATE TABLE politicians (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pa_legislator_id VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  party CHAR(1) NOT NULL CHECK (party IN ('D', 'R', 'I')),
  district VARCHAR(10),
  county VARCHAR(100),
  office_type VARCHAR(20) NOT NULL CHECK (office_type IN ('pa_house', 'pa_senate', 'governor')),
  title VARCHAR(50) NOT NULL,

  photo_url TEXT,
  twitter_handle VARCHAR(50),
  official_website TEXT,

  is_active BOOLEAN DEFAULT true,
  last_analyzed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Evidence Items (core unit — every score traces back to one of these)
CREATE TABLE evidence_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,

  evidence_type TEXT NOT NULL CHECK (evidence_type IN (
    'floor_vote', 'committee_vote',
    'bill_sponsorship', 'bill_cosponsorship',
    'committee_statement', 'floor_speech',
    'press_release', 'social_media',
    'questionnaire_response', 'other_endorsement'
  )),

  source_url TEXT,
  source_text TEXT,
  source_date TIMESTAMP WITH TIME ZONE NOT NULL,
  content_hash TEXT UNIQUE,

  bill_id TEXT,
  bill_title TEXT,
  vote_position TEXT CHECK (vote_position IN ('yea', 'nay', 'abstain', 'not_voting')),
  sponsorship_type TEXT CHECK (sponsorship_type IN ('sponsor', 'cosponsor')),

  -- Chamber priority bill gets 3x weight multiplier in scoring
  is_chamber_priority_bill BOOLEAN DEFAULT false,

  keyword_filter_passed BOOLEAN DEFAULT false,
  llm_relevance_score FLOAT,
  llm_relevance_rationale TEXT,
  is_relevant BOOLEAN DEFAULT false,

  tagged_principles TEXT[] DEFAULT '{}',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bill Direction Classifications (cached per bill per principle)
CREATE TABLE bill_classifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id TEXT NOT NULL,
  bill_title TEXT,
  bill_summary TEXT,
  principle TEXT NOT NULL CHECK (principle IN ('P1','P2','P3','P4','P5','P6','P7','P8','P9')),

  yea_direction INT NOT NULL CHECK (yea_direction IN (1, -1)),
  classification_confidence FLOAT NOT NULL,
  classification_rationale TEXT,

  llm_model TEXT,
  prompt_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(bill_id, principle)
);

-- Extracted Claims from statements (from Claude analysis)
CREATE TABLE extracted_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evidence_item_id UUID NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,

  claim_text TEXT NOT NULL,
  stance TEXT NOT NULL CHECK (stance IN ('support', 'oppose', 'neutral', 'conditional')),
  strength TEXT NOT NULL CHECK (strength IN ('strong', 'moderate', 'weak')),
  is_hedged BOOLEAN NOT NULL DEFAULT false,
  target_policy TEXT,
  tagged_principles TEXT[] DEFAULT '{}',

  claim_score FLOAT NOT NULL,

  extraction_confidence FLOAT NOT NULL,
  llm_model TEXT,
  prompt_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Principle Scores (one row per candidate per principle)
CREATE TABLE principle_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id UUID NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  principle TEXT NOT NULL CHECK (principle IN ('P1','P2','P3','P4','P5','P6','P7','P8','P9')),

  score FLOAT NOT NULL,

  confidence_evidence FLOAT NOT NULL,
  confidence_diversity FLOAT NOT NULL,
  confidence_avg_extraction FLOAT NOT NULL,
  confidence_overall FLOAT NOT NULL,

  num_evidence_items INT NOT NULL,
  num_votes INT DEFAULT 0,
  num_sponsorships INT DEFAULT 0,
  num_statements INT DEFAULT 0,
  unique_source_types INT NOT NULL,
  effective_sample_size FLOAT NOT NULL,
  evidence_date_range_start TIMESTAMP WITH TIME ZONE,
  evidence_date_range_end TIMESTAMP WITH TIME ZONE,

  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(politician_id, principle)
);

-- Overall Scores per Candidate
CREATE TABLE overall_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  politician_id UUID UNIQUE NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,

  overall_score FLOAT NOT NULL,
  overall_confidence FLOAT NOT NULL,

  p1_score FLOAT, p1_confidence FLOAT,
  p2_score FLOAT, p2_confidence FLOAT,
  p3_score FLOAT, p3_confidence FLOAT,
  p4_score FLOAT, p4_confidence FLOAT,
  p5_score FLOAT, p5_confidence FLOAT,
  p6_score FLOAT, p6_confidence FLOAT,
  p7_score FLOAT, p7_confidence FLOAT,
  p8_score FLOAT, p8_confidence FLOAT,
  p9_score FLOAT, p9_confidence FLOAT,

  overall_rank INT,
  party_rank INT,

  total_evidence_items INT NOT NULL,
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Batch Jobs
CREATE TABLE batch_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),

  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,

  metadata JSONB DEFAULT '{}',
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API Usage Log
CREATE TABLE api_usage_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  api_name VARCHAR(20) NOT NULL CHECK (api_name IN ('claude', 'legiscan', 'pa_legis')),

  endpoint TEXT,
  tokens_used INTEGER,
  estimated_cost DECIMAL(10, 6),

  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error')),
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_politicians_party ON politicians(party);
CREATE INDEX idx_politicians_district ON politicians(district);
CREATE INDEX idx_politicians_county ON politicians(county);
CREATE INDEX idx_politicians_office_type ON politicians(office_type);
CREATE INDEX idx_politicians_is_active ON politicians(is_active);

CREATE INDEX idx_evidence_politician ON evidence_items(politician_id);
CREATE INDEX idx_evidence_relevant ON evidence_items(is_relevant) WHERE is_relevant = true;
CREATE INDEX idx_evidence_bill ON evidence_items(bill_id) WHERE bill_id IS NOT NULL;
CREATE INDEX idx_evidence_type ON evidence_items(evidence_type);
CREATE INDEX idx_evidence_priority_bill ON evidence_items(is_chamber_priority_bill) WHERE is_chamber_priority_bill = true;
CREATE INDEX idx_evidence_content_hash ON evidence_items(content_hash);

CREATE INDEX idx_claims_evidence ON extracted_claims(evidence_item_id);

CREATE INDEX idx_bill_class_bill ON bill_classifications(bill_id);
CREATE INDEX idx_bill_class_principle ON bill_classifications(principle);

CREATE INDEX idx_principle_scores_politician ON principle_scores(politician_id);
CREATE INDEX idx_principle_scores_principle ON principle_scores(principle);

CREATE INDEX idx_overall_scores_score ON overall_scores(overall_score DESC);
CREATE INDEX idx_overall_scores_rank ON overall_scores(overall_rank);

CREATE INDEX idx_batch_jobs_status ON batch_jobs(status);
CREATE INDEX idx_batch_jobs_created_at ON batch_jobs(created_at DESC);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_politicians_updated_at BEFORE UPDATE ON politicians
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_evidence_items_updated_at BEFORE UPDATE ON evidence_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
