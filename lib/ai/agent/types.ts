// Feature-local plumbing for the AI Agent chat: wire format between the streaming
// route handler and the client, plus tool I/O shapes. Domain data types (Politician,
// CampaignContribution, etc.) live in lib/utils/types.ts — these do not duplicate them.

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AgentAction {
  kind: 'navigate';
  label: string;
  url: string;
}

export interface AgentCitation {
  label: string;
  url: string;
}

export type AgentStreamFrame =
  | { type: 'text_delta'; text: string }
  | { type: 'action'; action: AgentAction }
  | { type: 'citation'; citation: AgentCitation }
  | { type: 'done'; usage?: { input_tokens: number; output_tokens: number } }
  | { type: 'error'; code: string; message: string };

// ---- Tool output shapes ----

export interface CandidateSummary {
  candidate_id: string;
  full_name: string;
  party: string;
  district: string | null;
  office_type: string;
  candidacy_status: string;
  display_score: number | null; // 0-100, rescaled — null if no evidence yet
  percentile: number | null; // 0-100
  confidence: number | null; // 0-1 — low means the score is thin (e.g. one candidate survey), not proven
  profile_url: string;
}

export interface PrincipleScoreSummary {
  principle: string;
  principle_name: string;
  display_score: number; // 0-100, rescaled
  num_evidence_items: number;
}

export interface CandidateProfile extends CandidateSummary {
  title: string;
  committee_role: string | null;
  total_evidence_items: number;
  principle_scores: PrincipleScoreSummary[];
}

export interface DonorSummary {
  donor_name: string;
  amount: number;
  lean: string;
  profile_url: string | null;
}

export interface FundingBreakdown {
  candidate_id: string;
  full_name: string;
  total_raised: number;
  aligned_total: number; // pro_chamber
  misaligned_total: number; // anti_chamber
  neutral_total: number;
  top_donors: DonorSummary[];
}

export interface EvidenceSummary {
  source_url: string | null;
  source_date: string | null;
  evidence_type: string;
  excerpt: string | null;
}

export interface DistrictInfo {
  district: string;
  representatives: CandidateSummary[];
  election_history: Record<string, { dem_votes: number; rep_votes: number; winner_party: string | null }>;
  voter_registration: { republican: number; democrat: number; other: number; total: number } | null;
  // SCAI-generated estimate (deterministic baseline + Claude review) — not a real
  // prediction-market or professional forecast. Always disclose that when discussing it.
  estimated_odds: { dem_win_probability: number; rating: string; rationale: string } | null;
}
