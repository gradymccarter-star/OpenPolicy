// Core Types for PA Chamber of Commerce Endorsement Tool

export type PartyType = 'D' | 'R' | 'I';
export type OfficeType = 'pa_house' | 'pa_senate' | 'governor';
export type PrincipleId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6' | 'P7' | 'P8' | 'P9';

export type EvidenceType =
  | 'floor_vote'
  | 'committee_vote'
  | 'bill_sponsorship'
  | 'bill_cosponsorship'
  | 'committee_statement'
  | 'floor_speech'
  | 'press_release'
  | 'social_media'
  | 'questionnaire_response'
  | 'other_endorsement';

export type VotePosition = 'yea' | 'nay' | 'abstain' | 'not_voting';
export type Stance = 'support' | 'oppose' | 'neutral' | 'conditional';
export type Strength = 'strong' | 'moderate' | 'weak';
export type CandidacyStatus = 'incumbent' | 'challenger';
export type DataSource = 'legiscan' | 'candidate_filing';

export interface CommitteeAssignment {
  committee: string;
  role: string; // e.g. 'Republican Chair', 'Member'
}

// Politician
export interface Politician {
  id: string;
  pa_legislator_id: string;       // PA General Assembly unique ID (or synthetic 'cand:{district}:{name}' for non-incumbents)
  first_name: string;
  last_name: string;
  full_name: string;
  party: PartyType;
  district?: string;
  county?: string;
  office_type: OfficeType;
  title: string;

  photo_url?: string;
  twitter_handle?: string;
  official_website?: string;

  candidacy_status?: CandidacyStatus; // resolve with getCandidacyStatus() — may be absent pre-migration
  data_source?: DataSource;
  capitol_phone?: string;
  capitol_address?: string;
  district_office_phone?: string;
  district_office_address?: string;
  committee_assignments?: CommitteeAssignment[];

  is_active: boolean;
  last_analyzed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

// District-level historical general election results (one row per district per cycle)
export interface DistrictElectionHistory {
  id: string;
  district: string;
  election_year: number;
  office_type: OfficeType;

  dem_votes: number;
  rep_votes: number;
  other_votes: number;
  winner_party?: PartyType;

  source: string;
  created_at: Date;
}

// Shape of public/data/pa-house-election-history.json (static, see scripts/jobs/fetch-election-history.js)
export interface ElectionYearResult {
  dem_votes: number;
  rep_votes: number;
  other_votes: number;
  total_votes: number;
  winner_party: PartyType | null;
  margin_pct: number | null;
}

export interface ElectionHistoryFile {
  generated_at: string;
  description: string;
  sources: Record<string, string>;
  districts: Record<string, Record<string, ElectionYearResult>>;
}

// Shape of public/data/pa-house-contact-info.json (static, see scripts/jobs/fetch-contact-info.js)
export interface ContactCommitteeAssignment {
  committee: string;
  committeeUrl: string;
  role: string;
}

export interface ContactSocialLinks {
  website?: string;
  facebook?: string;
  twitter?: string;
  youtube?: string;
  contactForm?: string;
}

export interface LegislativeActivity {
  sessionLabel: string;
  billsSponsored: number;
  billsCoSponsored: number;
  resolutionsSponsored: number;
  resolutionsCoSponsored: number;
}

export interface DistrictContactInfo {
  name: string;
  party: string;
  county: string;
  capitolAddress?: string;
  capitolPhone?: string;
  capitolFax?: string;
  districtOfficeAddress?: string;
  districtOfficePhone?: string;
  districtOfficeFax?: string;
  committeeAssignments: ContactCommitteeAssignment[];
  occupation?: string[];
  education?: string[];
  legislativeActivity?: LegislativeActivity;
  socialLinks?: ContactSocialLinks;
  source_url: string;
}

export interface ContactInfoFile {
  generated_at: string;
  description: string;
  source: string;
  districts: Record<string, DistrictContactInfo>;
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
  p6_score?: number; p6_confidence?: number;
  p7_score?: number; p7_confidence?: number;
  p8_score?: number; p8_confidence?: number;
  p9_score?: number; p9_confidence?: number;

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
