import fs from 'fs';
import path from 'path';
import OverviewMapClient from '@/components/map/OverviewMapClient';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { getCandidacyStatus } from '@/lib/utils/helpers';
import { getNormalizedScore } from '@/lib/data/static-data';
import { getContactInfoForDistrict, getCommitteeChairLabel, getLeadershipTier, type LeadershipTier } from '@/lib/data/contact-info';
import type { ElectionHistoryFile, PoliticianWithScores } from '@/lib/utils/types';
import type { DistrictGeoJSON } from '@/components/map/PADistrictMap';

function buildCommitteeMaps(politiciansByDistrict: Record<string, PoliticianWithScores[]>): {
  committeeRoleById: Record<string, string>;
  leadershipTierById: Record<string, LeadershipTier>;
} {
  const committeeRoleById: Record<string, string> = {};
  const leadershipTierById: Record<string, LeadershipTier> = {};
  for (const [district, reps] of Object.entries(politiciansByDistrict)) {
    const contactInfo = getContactInfoForDistrict(district);
    for (const rep of reps) {
      if (getCandidacyStatus(rep) !== 'incumbent') continue;
      const label = getCommitteeChairLabel(contactInfo);
      if (label) committeeRoleById[rep.id] = label;
      const tier = getLeadershipTier(contactInfo);
      if (tier) leadershipTierById[rep.id] = tier;
    }
  }
  return { committeeRoleById, leadershipTierById };
}

async function getPoliticiansByDistrict() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('politicians')
    .select('*, overall_scores(*)')
    .eq('is_active', true)
    .eq('office_type', 'pa_house');

  if (error) throw error;

  const byDistrict: Record<string, PoliticianWithScores[]> = {};
  for (const row of data ?? []) {
    const politician = { ...row, overall_score: extractOverallScore(row) } as PoliticianWithScores;
    if (!politician.district) continue;
    (byDistrict[politician.district] ??= []).push(politician);
  }
  return byDistrict;
}

async function getFundingTotals() {
  const supabase = getSupabase();
  const totals: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('campaign_contributions')
      .select('politician_id, amount')
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (!r.politician_id) continue;
      totals[r.politician_id] = (totals[r.politician_id] ?? 0) + (Number(r.amount) || 0);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return totals;
}

function getDistrictGeoJSON(): DistrictGeoJSON {
  const filePath = path.join(process.cwd(), 'public', 'data', 'pa-house-districts.geojson');
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function getElectionHistory(): ElectionHistoryFile | null {
  const filePath = path.join(process.cwd(), 'public', 'data', 'pa-house-election-history.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export default async function OverviewPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ district?: string }>;
}) {
  let politiciansByDistrict: Record<string, PoliticianWithScores[]> = {};
  let fundingTotals: Record<string, number> = {};

  try {
    [politiciansByDistrict, fundingTotals] = await Promise.all([
      getPoliticiansByDistrict(),
      getFundingTotals(),
    ]);
  } catch (error) {
    console.error('Failed to load overview map data:', error);
  }

  const fundingIds = Object.keys(fundingTotals);
  const { committeeRoleById, leadershipTierById } = buildCommitteeMaps(politiciansByDistrict);

  const normalizedScoresById: Record<string, number | null> = {};
  for (const reps of Object.values(politiciansByDistrict)) {
    for (const p of reps) {
      const raw = p.overall_score?.overall_score;
      const hasEvidence = (p.overall_score?.total_evidence_items ?? 0) > 0;
      normalizedScoresById[p.id] = raw != null && hasEvidence ? getNormalizedScore(raw) : null;
    }
  }

  const geojson = getDistrictGeoJSON();
  const electionHistory = getElectionHistory();
  const districtCount = Object.keys(politiciansByDistrict).length;
  const { district: initialDistrict } = await searchParams;

  return (
    <main className="container-page py-10">
      <div className="mb-6">
        <p className="overline">
          2026 Pennsylvania House of Representatives
        </p>
        <h1 className="text-heading-1 mt-3 mb-1">District Map</h1>
        <p className="text-body-sm text-primary-500">
          All <span className="figure">203</span> PA House districts, colored by current officeholder. Click a district to see its representative,
          Chamber alignment score, and historical voting lean. {districtCount > 0 && <>Data available for <span className="figure">{districtCount}</span> districts.</>}
        </p>
      </div>

      <OverviewMapClient
        geojson={geojson}
        politiciansByDistrict={politiciansByDistrict}
        fundingIds={fundingIds}
        fundingTotals={fundingTotals}
        electionHistory={electionHistory}
        initialDistrict={initialDistrict ?? null}
        committeeRoleById={committeeRoleById}
        leadershipTierById={leadershipTierById}
        normalizedScoresById={normalizedScoresById}
      />
    </main>
  );
}

export const dynamic = 'force-dynamic';
