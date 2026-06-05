import Link from 'next/link';
import ScoreGauge from '@/components/scores/ScoreGauge';
import PrincipleScoreBar from '@/components/scores/PrincipleScoreBar';
import RadarChart from '@/components/scores/RadarChart';
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

  const [{ data: rawPrincipleScores }, { data: evidenceData }] = await Promise.all([
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
  ]);

  const politician = politicianRow;
  const principleScores = rawPrincipleScores ?? [];
  const evidenceItems = (evidenceData ?? []).map((item) => ({
    ...item,
    claims: item.extracted_claims ?? [],
  }));

  const overallData = extractOverallScore(politicianRow);
  const overallScore = overallData?.overall_score ?? 0;
  const overallConfidence = overallData?.overall_confidence ?? 0;
  const totalEvidence = overallData?.total_evidence_items ?? 0;

  const radarScores = Object.entries(PA_CHAMBER_PRINCIPLES).map(([key]) => {
    const ps = principleScores.find((s: any) => s.principle === key);
    return { label: key, value: ps?.score ?? ((overallData as any)?.[`${key.toLowerCase()}_score`] ?? 0) };
  });

  return (
    <main className="container-page py-12">
      {/* Header */}
      <div className="card p-8 mb-8">
        <div className="flex items-start space-x-6">
          {politician.photo_url && (
            <div className="relative w-32 h-32 rounded-full overflow-hidden flex-shrink-0" style={{ border: '2px solid var(--border)' }}>
              <Image
                src={politician.photo_url}
                alt={politician.full_name}
                fill
                className="object-cover grayscale"
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

      {/* Radar + Principle Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
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

      {/* Methodology */}
      <div className="card p-8 mb-8">
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

      {/* Evidence Trail */}
      <div className="card p-8">
        <h2 className="text-heading-3 mb-2">Evidence Trail</h2>
        <p className="text-body-sm text-primary-400 mb-6">
          Every score is traceable to the specific evidence items below. Click any source link to verify.
        </p>
        <div className="space-y-4">
          {evidenceItems.map((item: any) => (
            <div key={item.id} className="p-4" style={{ border: '1px solid var(--border)', borderRadius: '12px' }}>
              <div className="flex items-center space-x-3 mb-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-medium" style={{ background: 'var(--surface-canvas)', color: 'var(--foreground)' }}>
                  {EVIDENCE_TYPE_LABELS[item.evidence_type] || item.evidence_type}
                </span>
                <span className="text-caption text-primary-400">
                  {new Date(item.source_date).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'short', day: 'numeric',
                  })}
                </span>
                {item.tagged_principles?.map((p: string) => (
                  <span key={p} className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-medium bg-primary-100 text-primary-600">
                    {p}
                  </span>
                ))}
              </div>

              {item.vote_position && (() => {
                let voteClass = 'text-primary-300';
                if (item.vote_position === 'yea') voteClass = 'text-primary-950 font-semibold';
                else if (item.vote_position === 'nay') voteClass = 'text-primary-400';
                return (
                  <p className="text-body-sm text-primary-500 mb-1">
                    <span className="font-medium">Vote:</span>{' '}
                    <span className={voteClass}>{item.vote_position.toUpperCase()}</span>
                    {item.bill_title && ` on ${item.bill_title}`}
                  </p>
                );
              })()}

              {item.source_text && !item.vote_position && (
                <p className="text-body-sm text-primary-500 line-clamp-3 mb-2">
                  {item.source_text}
                </p>
              )}

              {item.claims && item.claims.length > 0 && (
                <div className="mt-2 space-y-1">
                  {item.claims.map((claim: any) => {
                    let stanceClass = 'bg-primary-100 text-primary-600';
                    if (claim.stance === 'support') stanceClass = 'bg-primary-950 text-white';
                    else if (claim.stance === 'oppose') stanceClass = 'bg-primary-200 text-primary-600';
                    else if (claim.stance === 'conditional') stanceClass = 'bg-primary-100 text-primary-500';
                    return (
                      <div key={claim.id} className="flex items-start space-x-2 text-caption rounded p-2" style={{ background: 'var(--surface-canvas)' }}>
                        <span className={`inline-flex px-1.5 py-0.5 rounded font-medium ${stanceClass}`}>
                          {claim.stance}/{claim.strength}
                        </span>
                        <span className="text-primary-500 flex-1">
                          &ldquo;{claim.claim_text}&rdquo;
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption text-primary-500 hover:text-primary-950 mt-1 inline-block transition-colors underline"
                >
                  View source &rarr;
                </a>
              )}
            </div>
          ))}
          {evidenceItems.length === 0 && (
            <p className="text-primary-400 text-center py-8">
              No evidence items found. Run the evaluation pipeline to collect evidence.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export const dynamic = 'force-dynamic';
