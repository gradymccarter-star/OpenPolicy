import Link from 'next/link';
import ScoreGauge from '@/components/scores/ScoreGauge';
import PrincipleScoreBar from '@/components/scores/PrincipleScoreBar';
import RadarChart from '@/components/scores/RadarChart';
import ProfileTabs from '@/components/politicians/ProfileTabs';
import { PartyBadge } from '@/components/ui/Badge';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { PA_CHAMBER_PRINCIPLES, EVIDENCE_TYPE_LABELS, EVIDENCE_WEIGHTS } from '@/lib/utils/constants';
import Image from 'next/image';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CandidateDetailPage({
  params,
}: {
  readonly params: { readonly id: string };
}) {
  if (!UUID_REGEX.test(params.id)) {
    return <div className="container-page py-12 text-primary-500">Candidate not found</div>;
  }

  const supabase = getSupabase();

  const { data: politicianRow } = await supabase
    .from('politicians')
    .select('*, overall_scores(*)')
    .eq('id', params.id)
    .maybeSingle();

  if (!politicianRow) {
    return <div className="container-page py-12 text-primary-500">Candidate not found</div>;
  }

  const [{ data: rawPrincipleScores }, { data: evidenceData }, { data: contributionData }] = await Promise.all([
    supabase
      .from('principle_scores')
      .select('*')
      .eq('politician_id', params.id)
      .order('principle'),
    supabase
      .from('evidence_items')
      .select('*, extracted_claims(*)')
      .eq('politician_id', params.id)
      .eq('is_relevant', true)
      .order('source_date', { ascending: false })
      .limit(50),
    supabase
      .from('campaign_contributions')
      .select('*, donor_organizations(lean, industry)')
      .eq('politician_id', params.id)
      .order('amount', { ascending: false }),
  ]);

  const politician = politicianRow;
  const principleScores = rawPrincipleScores ?? [];
  const evidenceItems = (evidenceData ?? []).map((item) => ({
    ...item,
    claims: item.extracted_claims ?? [],
  }));
  const contributions = (contributionData ?? []) as any[];

  const overallData = extractOverallScore(politicianRow);
  const overallScore = overallData?.overall_score ?? 0;
  const overallConfidence = overallData?.overall_confidence ?? 0;
  const totalEvidence = overallData?.total_evidence_items ?? 0;

  const radarScores = Object.entries(PA_CHAMBER_PRINCIPLES).map(([key]) => {
    const ps = principleScores.find((s: any) => s.principle === key);
    return { label: key, value: ps?.score ?? ((overallData as any)?.[`${key.toLowerCase()}_score`] ?? 0) };
  });

  const principleScoresSection = (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="card p-8 flex items-center justify-center">
        <RadarChart scores={radarScores} size={260} label="Issue Profile" />
      </div>
      <div className="lg:col-span-2 card p-8">
        <h2 className="text-heading-3 mb-6">PA Chamber Priority Alignment</h2>
        <div className="space-y-6">
          {principleScores.map((ps: any) => {
            const principleInfo = PA_CHAMBER_PRINCIPLES[ps.principle];
            return (
              <PrincipleScoreBar
                key={ps.principle}
                principleName={principleInfo?.name ?? ps.principle}
                score={ps.score}
                confidence={ps.confidence_overall}
                numEvidenceItems={ps.num_evidence_items}
                numVotes={ps.num_votes}
                numSponsorships={ps.num_sponsorships}
                numStatements={ps.num_statements}
              />
            );
          })}
          {principleScores.length === 0 && (
            <div className="space-y-6">
              {Object.entries(PA_CHAMBER_PRINCIPLES).map(([key, p]) => {
                const score = (overallData as any)?.[`${key.toLowerCase()}_score`] ?? 0;
                return (
                  <PrincipleScoreBar
                    key={key}
                    principleName={p.name}
                    score={score}
                    confidence={overallConfidence}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const methodologySection = (
    <div className="card p-8">
      <h2 className="text-heading-3 mb-6">How This Score Was Calculated</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { num: '1', title: 'Evidence Collection', desc: 'We collect floor votes, committee votes, bill sponsorships, co-sponsorships, committee statements, floor speeches, press releases, and candidate questionnaire responses from PA General Assembly records and public sources.' },
          { num: '2', title: 'AI Classification', desc: 'Each evidence item is filtered by PA business relevance keywords, then classified by Claude AI for alignment with the nine Chamber priorities. Bills are classified for direction. Statements have structured claims extracted.' },
          { num: '3', title: 'Weighted Scoring', desc: 'Scores are computed using transparent math. Bill sponsorships carry the highest weight. Sponsorships tied to Chamber priority bills receive a 3× multiplier. Temporal decay reduces older evidence. Every claim links to its source.' },
        ].map(step => (
          <div key={step.num} className="p-5" style={{ border: '1px solid var(--border)', borderRadius: '12px' }}>
            <div className="w-8 h-8 bg-primary-950 text-white rounded-full flex items-center justify-center font-bold text-caption mb-3">{step.num}</div>
            <h3 className="font-semibold text-primary-950 mb-2 text-body-sm">{step.title}</h3>
            <p className="text-caption text-primary-500 leading-relaxed">{step.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
        <h3 className="font-semibold text-primary-950 mb-3 text-body-sm">Evidence Type Weights</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(EVIDENCE_WEIGHTS).map(([type, weight]) => (
            <div key={type} className="flex items-center space-x-2 rounded-lg px-3 py-2" style={{ background: 'var(--surface-canvas)' }}>
              <span className="text-caption font-medium text-primary-500">
                {EVIDENCE_TYPE_LABELS[type] || type}
              </span>
              <span className="text-caption font-bold text-primary-950">{weight}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <main className="container-page py-12">
      {/* Header */}
      <div className="card p-8 mb-8">
        <div className="flex items-start space-x-6">
          {politician.photo_url && (
            <div className="relative w-32 h-32 rounded-full overflow-hidden flex-shrink-0" style={{ border: '3px solid #c9a84c' }}>
              <Image
                src={politician.photo_url}
                alt={politician.full_name}
                fill
                className="object-cover"
                style={{ objectPosition: '50% 15%' }}
              />
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-heading-1 mb-2">{politician.full_name}</h1>
            <div className="flex items-center space-x-3 mb-2">
              <PartyBadge party={politician.party} />
              {politician.district && (
                <span className="text-primary-500 text-body-sm">District {politician.district}</span>
              )}
              {politician.county && (
                <span className="text-primary-400 text-caption">{politician.county} County</span>
              )}
              <span className="text-primary-500 text-body-sm">{politician.title}</span>
            </div>
            <p className="text-caption text-primary-400 mb-3">
              Score based on {totalEvidence} evidence item{totalEvidence === 1 ? '' : 's'}
            </p>
            <div className="flex gap-3">
              <Link
                href={`/politicians/${params.id}/brief`}
                className="btn-primary text-caption py-2 px-4"
              >
                Endorsement Brief &rarr;
              </Link>
              <Link
                href={`/compare?a=${params.id}`}
                className="btn-secondary text-caption py-2 px-4"
              >
                Compare
              </Link>
            </div>
          </div>
          <ScoreGauge
            score={overallScore}
            confidence={overallConfidence}
            size="large"
            label="Chamber Alignment"
          />
        </div>
      </div>

      {/* Tabbed content: Analysis | Funding */}
      <ProfileTabs
        evidenceItems={evidenceItems}
        contributions={contributions}
        principleScoresSection={principleScoresSection}
        methodologySection={methodologySection}
      />
    </main>
  );
}

export const dynamic = 'force-dynamic';
