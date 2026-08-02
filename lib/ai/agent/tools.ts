import fs from 'fs';
import path from 'path';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { rescaleScore, getCandidacyStatus, donorProfileUrl } from '@/lib/utils/helpers';
import { getNormalizedScore, getVoterRegistration, getDistrictOdds } from '@/lib/data/static-data';
import { getContactInfoForDistrict, getCommitteeChairLabel } from '@/lib/data/contact-info';
import { PA_CHAMBER_PRINCIPLES } from '@/lib/utils/constants';
import type { PrincipleId, ElectionHistoryFile } from '@/lib/utils/types';
import type {
  CandidateSummary,
  CandidateProfile,
  FundingBreakdown,
  DistrictInfo,
  EvidenceSummary,
  DonorSummary,
} from './types';

// ---- JSON-schema tool definitions handed to the Anthropic `tools` param ----
// Hand-written rather than derived from zod: 7 tools is small enough that a single
// source of truth (these schemas) is less risk than keeping two schema systems in sync.

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'search_candidates',
    description:
      'Search/filter PA House candidates (incumbents and challengers). Returns up to 20 matches with their Chamber alignment score and percentile. Always use this first to resolve a name to a candidate_id before calling any other candidate tool — never guess or invent a candidate_id.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text match against candidate name.' },
        party: {
          type: 'array',
          items: { type: 'string', enum: ['D', 'R', 'I'] },
          description: 'Filter by party.',
        },
        district: { type: 'string', description: 'Exact 3-digit district code, e.g. "042".' },
      },
    },
  },
  {
    name: 'get_candidate_profile',
    description:
      'Get a resolved candidate\'s full profile: overall Chamber alignment score, percentile, per-principle (P1-P9) scores, and committee/leadership role.',
    input_schema: {
      type: 'object',
      properties: {
        candidate_id: { type: 'string', description: 'A real candidate_id returned by search_candidates or get_district_info.' },
      },
      required: ['candidate_id'],
    },
  },
  {
    name: 'get_funding_breakdown',
    description:
      "Get a candidate's campaign finance breakdown: total raised, amounts from Chamber-aligned vs. Chamber-misaligned donors, and top individual donors with citation links.",
    input_schema: {
      type: 'object',
      properties: {
        candidate_id: { type: 'string', description: 'A real candidate_id returned by search_candidates or get_district_info.' },
        cycle_year: { type: 'number', description: 'Optional election cycle year to filter to, e.g. 2024.' },
      },
      required: ['candidate_id'],
    },
  },
  {
    name: 'compare_candidates',
    description: 'Compare 2-4 resolved candidates side by side on overall and per-principle Chamber alignment scores.',
    input_schema: {
      type: 'object',
      properties: {
        candidate_ids: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 4,
          description: 'Real candidate_ids returned by search_candidates.',
        },
      },
      required: ['candidate_ids'],
    },
  },
  {
    name: 'get_district_info',
    description:
      'Get district-level context: current representatives/challengers, historical general election results, voter registration breakdown, and a SCAI-generated win-probability estimate (estimated_odds) with a rationale. Use this for any "what are the odds/who will win district X" question — always disclose that estimated_odds is our own AI-generated estimate, not a real prediction market or professional forecast.',
    input_schema: {
      type: 'object',
      properties: {
        district: { type: 'string', description: 'Exact 3-digit district code, e.g. "042".' },
      },
      required: ['district'],
    },
  },
  {
    name: 'get_evidence_for_principle',
    description:
      'Get up to 5 cited evidence items (votes, sponsorships, statements) backing a candidate\'s score on one PA Chamber priority. Use this before making any specific factual claim about why a candidate scored the way they did.',
    input_schema: {
      type: 'object',
      properties: {
        candidate_id: { type: 'string', description: 'A real candidate_id returned by search_candidates or get_district_info.' },
        principle: {
          type: 'string',
          enum: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'],
          description: 'Which of the nine PA Chamber priorities to pull evidence for.',
        },
      },
      required: ['candidate_id', 'principle'],
    },
  },
  {
    name: 'navigate',
    description:
      "Offer to open a page in the app for the visitor — a candidate's profile, a district on the map, or a side-by-side comparison. Call this whenever the user's intent implies wanting to see a page, not just hear the answer in text. This does not navigate anything by itself — it surfaces a clickable link in the chat.",
    input_schema: {
      type: 'object',
      properties: {
        destination: { type: 'string', enum: ['candidate_profile', 'district_map', 'compare'] },
        candidate_id: { type: 'string', description: 'Required for candidate_profile; the first candidate for compare.' },
        candidate_id_b: { type: 'string', description: 'Required for compare; the second candidate.' },
        district: { type: 'string', description: 'Required for district_map.' },
        label: { type: 'string', description: 'Short link text to display, e.g. "Open Rep. Smith\'s Profile".' },
      },
      required: ['destination', 'label'],
    },
  },
];

// ---- Shared helpers ----

function toCandidateSummary(row: any): CandidateSummary {
  const overallData = extractOverallScore(row);
  const rawScore = overallData?.overall_score;
  const hasEvidence = (overallData?.total_evidence_items ?? 0) > 0;
  return {
    candidate_id: row.id,
    full_name: row.full_name,
    party: row.party,
    district: row.district ?? null,
    office_type: row.office_type,
    candidacy_status: getCandidacyStatus(row),
    display_score: hasEvidence && rawScore != null ? Math.round(rescaleScore(rawScore) * 100) : null,
    percentile: hasEvidence && rawScore != null ? getNormalizedScore(rawScore) : null,
    profile_url: `/politicians/${row.id}`,
  };
}

let _electionHistory: ElectionHistoryFile | null | undefined;
function loadElectionHistory(): ElectionHistoryFile | null {
  if (_electionHistory !== undefined) return _electionHistory;
  const filePath = path.join(process.cwd(), 'public', 'data', 'pa-house-election-history.json');
  _electionHistory = fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ElectionHistoryFile) : null;
  return _electionHistory;
}

// ---- Tool implementations ----

async function searchCandidates(input: { query?: string; party?: string[]; district?: string }): Promise<{ results: CandidateSummary[] }> {
  const supabase = getSupabase();
  let query = supabase.from('politicians').select('*, overall_scores(*)').eq('is_active', true);
  if (input.district) query = query.eq('district', input.district);

  const { data } = await query;
  let rows = data ?? [];

  if (input.party?.length) rows = rows.filter((r: any) => input.party!.includes(r.party));
  if (input.query) {
    const needle = input.query.toLowerCase();
    rows = rows.filter((r: any) => r.full_name?.toLowerCase().includes(needle));
  }

  const summaries = rows.map(toCandidateSummary).sort((a, b) => (b.display_score ?? -1) - (a.display_score ?? -1) || a.full_name.localeCompare(b.full_name));
  return { results: summaries.slice(0, 20) };
}

async function getCandidateProfileById(candidateId: string): Promise<CandidateProfile | null> {
  const supabase = getSupabase();
  const { data: row } = await supabase.from('politicians').select('*, overall_scores(*)').eq('id', candidateId).maybeSingle();
  if (!row) return null;

  const { data: principleRows } = await supabase.from('principle_scores').select('*').eq('politician_id', candidateId).order('principle');
  const overallData = extractOverallScore(row);
  const summary = toCandidateSummary(row);

  const contactInfo = summary.candidacy_status === 'incumbent' ? getContactInfoForDistrict(row.district) : null;
  const committeeRole = getCommitteeChairLabel(contactInfo);

  const principleScores = Object.entries(PA_CHAMBER_PRINCIPLES).map(([key, info]) => {
    const ps = (principleRows ?? []).find((r: any) => r.principle === key);
    const rawScore = ps?.score ?? (overallData as any)?.[`${key.toLowerCase()}_score`] ?? 0;
    return {
      principle: key,
      principle_name: info.name,
      display_score: Math.round(rescaleScore(rawScore) * 100),
      num_evidence_items: ps?.num_evidence_items ?? 0,
    };
  });

  return {
    ...summary,
    title: row.title,
    committee_role: committeeRole,
    total_evidence_items: overallData?.total_evidence_items ?? 0,
    principle_scores: principleScores,
  };
}

async function getCandidateProfile(input: { candidate_id: string }): Promise<CandidateProfile | { error: string }> {
  const profile = await getCandidateProfileById(input.candidate_id);
  if (!profile) return { error: 'No candidate found with that candidate_id. Use search_candidates first.' };
  return profile;
}

async function getFundingBreakdown(input: { candidate_id: string; cycle_year?: number }): Promise<FundingBreakdown | { error: string }> {
  const supabase = getSupabase();
  const { data: politician } = await supabase.from('politicians').select('full_name').eq('id', input.candidate_id).maybeSingle();
  if (!politician) return { error: 'No candidate found with that candidate_id. Use search_candidates first.' };

  let query = supabase
    .from('campaign_contributions')
    .select('*, donor_organizations(lean, industry)')
    .eq('politician_id', input.candidate_id);
  if (input.cycle_year) query = query.eq('cycle_year', input.cycle_year);

  const { data: contributions } = await query;
  const rows = contributions ?? [];

  let alignedTotal = 0;
  let misalignedTotal = 0;
  let neutralTotal = 0;
  let totalRaised = 0;
  for (const c of rows) {
    const amount = Number(c.amount) || 0;
    totalRaised += amount;
    const lean = c.donor_organizations?.lean ?? 'unknown';
    if (lean === 'pro_chamber') alignedTotal += amount;
    else if (lean === 'anti_chamber') misalignedTotal += amount;
    else neutralTotal += amount;
  }

  const topDonors: DonorSummary[] = [...rows]
    .sort((a: any, b: any) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
    .slice(0, 8)
    .map((c: any) => ({
      donor_name: c.donor_name,
      amount: Number(c.amount) || 0,
      lean: c.donor_organizations?.lean ?? 'unknown',
      profile_url: donorProfileUrl(c.followthemoney_id),
    }));

  return {
    candidate_id: input.candidate_id,
    full_name: politician.full_name,
    total_raised: totalRaised,
    aligned_total: alignedTotal,
    misaligned_total: misalignedTotal,
    neutral_total: neutralTotal,
    top_donors: topDonors,
  };
}

async function compareCandidates(input: { candidate_ids: string[] }): Promise<{ candidates: CandidateProfile[] } | { error: string }> {
  if (!Array.isArray(input.candidate_ids) || input.candidate_ids.length < 2 || input.candidate_ids.length > 4) {
    return { error: 'candidate_ids must contain 2-4 real candidate_ids from search_candidates.' };
  }
  const profiles = await Promise.all(input.candidate_ids.map(getCandidateProfileById));
  const resolved = profiles.filter((p): p is CandidateProfile => p !== null);
  if (resolved.length < 2) return { error: 'Could not resolve at least 2 of the given candidate_ids. Use search_candidates first.' };
  return { candidates: resolved };
}

async function getDistrictInfo(input: { district: string }): Promise<DistrictInfo> {
  const supabase = getSupabase();
  const { data: rows } = await supabase
    .from('politicians')
    .select('*, overall_scores(*)')
    .eq('district', input.district)
    .eq('is_active', true);

  const representatives = (rows ?? []).map(toCandidateSummary);
  const electionHistory = loadElectionHistory()?.districts[input.district] ?? {};
  const voterReg = getVoterRegistration(input.district);
  const odds = getDistrictOdds(input.district);

  return {
    district: input.district,
    representatives,
    election_history: Object.fromEntries(
      Object.entries(electionHistory).map(([year, r]) => [year, { dem_votes: r.dem_votes, rep_votes: r.rep_votes, winner_party: r.winner_party }])
    ),
    voter_registration: voterReg
      ? { republican: voterReg.republican, democrat: voterReg.democrat, other: voterReg.other, total: voterReg.total }
      : null,
    estimated_odds: odds ? { dem_win_probability: odds.dem_win_probability, rating: odds.rating, rationale: odds.rationale } : null,
  };
}

async function getEvidenceForPrinciple(input: { candidate_id: string; principle: PrincipleId }): Promise<{ evidence: EvidenceSummary[] }> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('evidence_items')
    .select('source_url, source_date, evidence_type, source_text, tagged_principles')
    .eq('politician_id', input.candidate_id)
    .eq('is_relevant', true)
    .contains('tagged_principles', [input.principle])
    .order('source_date', { ascending: false })
    .limit(5);

  const evidence: EvidenceSummary[] = (data ?? []).map((item: any) => ({
    source_url: item.source_url ?? null,
    source_date: item.source_date ?? null,
    evidence_type: item.evidence_type,
    excerpt: item.source_text ? String(item.source_text).slice(0, 280) : null,
  }));

  return { evidence };
}

function navigate(input: { destination: string; candidate_id?: string; candidate_id_b?: string; district?: string; label: string }) {
  let url: string | null = null;
  if (input.destination === 'candidate_profile' && input.candidate_id) {
    url = `/politicians/${input.candidate_id}`;
  } else if (input.destination === 'district_map' && input.district) {
    url = `/overview?district=${input.district}`;
  } else if (input.destination === 'compare' && input.candidate_id && input.candidate_id_b) {
    url = `/compare?a=${input.candidate_id}&b=${input.candidate_id_b}`;
  }
  if (!url) return { status: 'error' as const, message: 'Missing required parameters for this destination.' };
  return { status: 'ok' as const, url, label: input.label };
}

// ---- Dispatcher ----

export async function executeTool(name: string, input: any): Promise<unknown> {
  switch (name) {
    case 'search_candidates':
      return searchCandidates(input);
    case 'get_candidate_profile':
      return getCandidateProfile(input);
    case 'get_funding_breakdown':
      return getFundingBreakdown(input);
    case 'compare_candidates':
      return compareCandidates(input);
    case 'get_district_info':
      return getDistrictInfo(input);
    case 'get_evidence_for_principle':
      return getEvidenceForPrinciple(input);
    case 'navigate':
      return navigate(input);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
