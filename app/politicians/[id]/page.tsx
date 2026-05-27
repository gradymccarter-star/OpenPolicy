import Link from 'next/link';
import ScoreGauge from '@/components/scores/ScoreGauge';
import PrincipleScoreBar from '@/components/scores/PrincipleScoreBar';
import RadarChart from '@/components/scores/RadarChart';
import { PartyBadge, StateBadge } from '@/components/ui/Badge';
import { getDB } from '@/lib/db/client';
import { OECD_PRINCIPLES, EVIDENCE_TYPE_LABELS, EVIDENCE_WEIGHTS } from '@/lib/utils/constants';
import Image from 'next/image';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PoliticianDetailPage({
  params,
}: {
  params: { id: string };
}) {
  if (!UUID_REGEX.test(params.id)) {
    return <div className="container-page py-12 text-primary-500">Politician not found</div>;
  }

  const db = getDB();

  const [politician] = await db`
    SELECT p.*, row_to_json(os.*) as overall_score_data
    FROM politicians p
    LEFT JOIN overall_scores os ON p.id = os.politician_id
    WHERE p.id = ${params.id}
  `;

  if (!politician) {
    return <div className="container-page py-12 text-primary-500">Politician not found</div>;
  }

  const principleScores = await db`
    SELECT *
    FROM principle_scores
    WHERE politician_id = ${params.id}
    ORDER BY principle
  `;

  const evidenceItems = await db`
    SELECT ei.*,
      COALESCE(
        (SELECT json_agg(ec.*)
         FROM extracted_claims ec
         WHERE ec.evidence_item_id = ei.id),
        '[]'
      ) as claims
    FROM evidence_items ei
    WHERE ei.politician_id = ${params.id}
      AND ei.is_relevant = true
    ORDER BY ei.source_date DESC
    LIMIT 50
  `;

  const overallData = politician.overall_score_data;
  const overallScore = overallData?.overall_score ?? 0;
  const overallConfidence = overallData?.overall_confidence ?? 0;
  const totalEvidence = overallData?.total_evidence_items ?? 0;

  const radarScores = Object.entries(OECD_PRINCIPLES).map(([key]) => {
    const ps = principleScores.find((s: any) => s.principle === key);
    return { label: key, value: ps?.score ?? (overallData?.[`${key.toLowerCase()}_score`] ?? 0) };
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
            <h1 className="text-heading-1 mb-2">
              {politician.full_name}
            </h1>
            <div className="flex items-center space-x-3 mb-4">
              <PartyBadge party={politician.party} />
              <StateBadge state={politician.state} />
              <span className="text-primary-500 text-body-sm">{politician.title}</span>
            </div>
            <p className="text-caption text-primary-400">
              Score based on {totalEvidence} evidence item{totalEvidence !== 1 ? 's' : ''}
            </p>
            <Link
              href={`/compare?a=${params.id}`}
              className="btn-secondary mt-3 text-caption py-2 px-4"
            >
              Compare with another senator &rarr;
            </Link>
          </div>
          <ScoreGauge
            score={overallScore}
            confidence={overallConfidence}
            size="large"
            label="Overall Score"
          />
        </div>
      </div>

      {/* Radar + Principle Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        <div className="card p-8 flex items-center justify-center">
          <RadarChart scores={radarScores} size={260} label="Principle Profile" />
        </div>
        <div className="lg:col-span-2 card p-8">
          <h2 className="text-heading-3 mb-6">
            OECD Principle Alignment
          </h2>
          <div className="space-y-6">
            {principleScores.map((ps: any) => {
              const principleInfo = OECD_PRINCIPLES[ps.principle];
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
                {Object.entries(OECD_PRINCIPLES).map(([key, p]) => {
                  const score = overallData?.[`${key.toLowerCase()}_score`] ?? 0;
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
        <h2 className="text-heading-3 mb-6">
          How This Score Was Calculated
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { num: '1', title: 'Evidence Collection', desc: 'We collect floor votes, bill sponsorships, co-sponsorships, committee statements, floor speeches, and press releases from public congressional records.' },
            { num: '2', title: 'AI Classification', desc: 'Each evidence item is filtered by AI relevance keywords, then classified by Claude AI for relevance to OECD principles. Bills are classified for direction. Statements have structured claims extracted.' },
            { num: '3', title: 'Deterministic Scoring', desc: 'Scores are computed using transparent math. Each evidence type has a weight (votes: 1.0, sponsorships: 0.9, statements: 0.4-0.6). Temporal decay reduces older evidence.' },
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
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3">
              {Object.entries(EVIDENCE_WEIGHTS).slice(0, 4).map(([type, weight]) => (
                <div key={type} className="flex items-center space-x-2 rounded-lg px-3 py-2" style={{ background: 'var(--surface-canvas)' }}>
                  <span className="text-caption font-medium text-primary-500">
                    {EVIDENCE_TYPE_LABELS[type] || type}
                  </span>
                  <span className="text-caption font-bold text-primary-950">{weight.toFixed(1)}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              {Object.entries(EVIDENCE_WEIGHTS).slice(4).map(([type, weight]) => (
                <div key={type} className="flex items-center space-x-2 rounded-lg px-3 py-2" style={{ background: 'var(--surface-canvas)' }}>
                  <span className="text-caption font-medium text-primary-500">
                    {EVIDENCE_TYPE_LABELS[type] || type}
                  </span>
                  <span className="text-caption font-bold text-primary-950">{weight.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Evidence Trail */}
      <div className="card p-8">
        <h2 className="text-heading-3 mb-6">
          Evidence Trail
        </h2>
        <p className="text-body-sm text-primary-400 mb-6">
          Every score is traceable to specific evidence items below.
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

              {item.vote_position && (
                <p className="text-body-sm text-primary-500 mb-1">
                  <span className="font-medium">Vote:</span>{' '}
                  <span className={
                    item.vote_position === 'yea' ? 'text-primary-950 font-semibold' :
                    item.vote_position === 'nay' ? 'text-primary-400' : 'text-primary-300'
                  }>
                    {item.vote_position.toUpperCase()}
                  </span>
                  {item.bill_title && ` on ${item.bill_title}`}
                </p>
              )}

              {item.source_text && !item.vote_position && (
                <p className="text-body-sm text-primary-500 line-clamp-3 mb-2">
                  {item.source_text}
                </p>
              )}

              {item.claims && item.claims.length > 0 && (
                <div className="mt-2 space-y-1">
                  {item.claims.map((claim: any, idx: number) => (
                    <div key={idx} className="flex items-start space-x-2 text-caption rounded p-2" style={{ background: 'var(--surface-canvas)' }}>
                      <span className={`inline-flex px-1.5 py-0.5 rounded font-medium ${
                        claim.stance === 'support' ? 'bg-primary-950 text-white' :
                        claim.stance === 'oppose' ? 'bg-primary-200 text-primary-600' :
                        claim.stance === 'conditional' ? 'bg-primary-100 text-primary-500' :
                        'bg-primary-100 text-primary-600'
                      }`}>
                        {claim.stance}/{claim.strength}
                      </span>
                      <span className="text-primary-500 flex-1">
                        &ldquo;{claim.claim_text}&rdquo;
                      </span>
                      <span className="text-primary-400 whitespace-nowrap">
                        score: {claim.claim_score?.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption text-primary-500 hover:text-primary-950 mt-1 inline-block transition-colors underline"
                >
                  View source
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
