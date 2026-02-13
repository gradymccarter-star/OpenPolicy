// Core Types for Political AI Alignment Evaluator
// Updated: Evidence-based multi-signal evaluation methodology

export type PartyType = 'D' | 'R' | 'I';
export type OfficeType = 'senate' | 'house' | 'governor';
export type PrincipleId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

export type EvidenceType =
  | 'floor_vote'
  | 'bill_sponsorship'
  | 'bill_cosponsorship'
  | 'committee_statement'
  | 'floor_speech'
  | 'press_release'
  | 'social_media';

export type VotePosition = 'yea' | 'nay' | 'abstain' | 'not_voting';
export type Stance = 'support' | 'oppose' | 'neutral' | 'conditional';
export type Strength = 'strong' | 'moderate' | 'weak';

// Politician
export interface Politician {
  id: string;
  bioguide_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  party: PartyType;
  state: string;
  district?: string;
  office_type: OfficeType;
  title: string;

  photo_url?: string;
  twitter_handle?: string;
  official_website?: string;

  is_active: boolean;
  last_analyzed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// Evidence Item (the core unit of the new methodology)
export interface EvidenceItem {
  id: string;
  politician_id: string;
  evidence_type: EvidenceType;

  source_url?: string;
  source_text?: string;
  source_date: Date;
  content_hash?: string;

  bill_id?: string;
  bill_title?: string;
  vote_position?: VotePosition;
  sponsorship_type?: 'sponsor' | 'cosponsor';

  keyword_filter_passed: boolean;
  llm_relevance_score?: number;
  llm_relevance_rationale?: string;
  is_relevant: boolean;

  tagged_principles: PrincipleId[];

  created_at: Date;
  updated_at: Date;
}

// Bill Direction Classification (cached per bill per principle)
export interface BillClassification {
  id: string;
  bill_id: string;
  bill_title?: string;
  bill_summary?: string;
  principle: PrincipleId;

  yea_direction: 1 | -1;
  classification_confidence: number;
  classification_rationale?: string;

  llm_model?: string;
  prompt_version?: string;
  created_at: Date;
}

// Extracted Claim from a statement
export interface ExtractedClaim {
  id: string;
  evidence_item_id: string;

  claim_text: string;
  stance: Stance;
  strength: Strength;
  is_hedged: boolean;
  target_policy?: string;
  tagged_principles: PrincipleId[];

  claim_score: number;

  extraction_confidence: number;
  llm_model?: string;
  prompt_version?: string;
  created_at: Date;
}

// Scored item (intermediate result for transparency)
export interface ScoredItem {
  score: number;
  weight: number;
  decay: number;
  confidence: number;
}

// Principle score result
export interface PrincipleResult {
  score: number;
  confidence_evidence: number;
  confidence_diversity: number;
  confidence_avg_extraction: number;
  confidence_overall: number;
  num_items: number;
  unique_source_types: number;
  effective_sample_size: number;
  items: ScoredItem[];
}

// Principle Score (stored in DB)
export interface PrincipleScore {
  id: string;
  politician_id: string;
  principle: PrincipleId;

  score: number;

  confidence_evidence: number;
  confidence_diversity: number;
  confidence_avg_extraction: number;
  confidence_overall: number;

  num_evidence_items: number;
  num_votes: number;
  num_sponsorships: number;
  num_statements: number;
  unique_source_types: number;
  effective_sample_size: number;
  evidence_date_range_start?: Date;
  evidence_date_range_end?: Date;

  computed_at: Date;
}

// Overall Score (stored in DB)
export interface OverallScore {
  id: string;
  politician_id: string;

  overall_score: number;
  overall_confidence: number;

  p1_score?: number; p1_confidence?: number;
  p2_score?: number; p2_confidence?: number;
  p3_score?: number; p3_confidence?: number;
  p4_score?: number; p4_confidence?: number;
  p5_score?: number; p5_confidence?: number;

  overall_rank?: number;
  party_rank?: number;

  total_evidence_items: number;
  computed_at: Date;
}

// Overall result from computation (before DB storage)
export interface OverallResult {
  overall_score: number;
  overall_confidence: number;
  principles: Record<string, PrincipleResult>;
}

// Evidence item enriched for scoring (joins evidence + bill classification + claims)
export interface EnrichedEvidenceItem {
  id: string;
  evidence_type: EvidenceType;
  source_date: Date;
  vote_position?: VotePosition;
  bill_yea_direction?: number;
  bill_direction_confidence?: number;
  claims?: ExtractedClaim[];
  extraction_confidence?: number;
}

// LLM response types
export interface RelevanceClassificationResult {
  relevant: boolean;
  confidence: number;
  oecd_principles: PrincipleId[];
  rationale: string;
}

export interface BillDirectionResult {
  yea_direction: 1 | -1;
  confidence: number;
  rationale: string;
}

export interface ClaimExtractionResult {
  claims: {
    claim_text: string;
    stance: Stance;
    strength: Strength;
    is_hedged: boolean;
    target_policy: string;
    oecd_principles: PrincipleId[];
  }[];
  extraction_confidence: number;
}

// Batch Job
export interface BatchJob {
  id: string;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';

  started_at?: Date;
  completed_at?: Date;

  metadata: {
    itemsProcessed?: number;
    itemsFailed?: number;
    totalItems?: number;
  };

  error_message?: string;
  created_at: Date;
}

// API Usage Log
export interface APIUsageLog {
  id: string;
  api_name: 'claude' | 'propublica' | 'twitter' | 'congress';

  endpoint?: string;
  tokens_used?: number;
  estimated_cost?: number;

  status: 'success' | 'error';
  error_message?: string;

  created_at: Date;
}

// Frontend Types
export interface PoliticianWithScores extends Politician {
  overall_score?: OverallScore;
  principle_scores?: PrincipleScore[];
}

// Evidence item with attached claims/classification for API responses
export interface EvidenceItemWithDetails extends EvidenceItem {
  claims?: ExtractedClaim[];
  bill_classification?: BillClassification[];
}

// Filter Options
export interface PoliticianFilters {
  party?: PartyType[];
  state?: string[];
  office_type?: OfficeType[];
  score_range?: {
    min: number;
    max: number;
  };
  search?: string;
}

export interface PoliticianSortOptions {
  field: 'name' | 'score' | 'party' | 'state';
  direction: 'asc' | 'desc';
}
