import Link from 'next/link';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { PA_CHAMBER_PRINCIPLES, EVIDENCE_TYPE_LABELS } from '@/lib/utils/constants';

function partyLabel(party: string): string {
  if (party === 'D') return 'Democrat';
  if (party === 'R') return 'Republican';
  return 'Independent';
}

const TYPE_ORDER: Record<string, number> = {
  bill_sponsorship: 1,
  floor_vote: 2,
  committee_vote: 3,
  bill_cosponsorship: 4,
  questionnaire_response: 5,
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function endorsementLabel(score: number): { label: string; color: string } {
  if (score >= 0.75) return { label: 'Recommend Endorsement', color: '#0a0e1a' };
  if (score >= 0.55) return { label: 'Lean Endorse', color: '#374151' };
  if (score >= 0.4) return { label: 'Neutral / Further Review', color: '#6b7280' };
  return { label: 'Do Not Endorse', color: '#9ca3af' };
}

function scoreBar(score: number) {
  const pct = Math.round(score * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full" style={{ background: 'var(--border)' }}>
        <div
          className="h-2 rounded-full"
          style={{ width: `${pct}%`, background: 'var(--foreground)' }}
        />
      </div>
      <span className="text-caption font-bold w-10 text-right">{pct}%</span>
    </div>
  );
}

export default async function EndorsementBriefPage({
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
      .limit(100),
  ]);

  const politician = politicianRow;
  const principleScores = rawPrincipleScores ?? [];
  const topEvidence = (evidenceData ?? [])
    .sort((a, b) => {
      const diff = (TYPE_ORDER[a.evidence_type] ?? 6) - (TYPE_ORDER[b.evidence_type] ?? 6);
      if (diff !== 0) return diff;
      return new Date(b.source_date).getTime() - new Date(a.source_date).getTime();
    })
    .slice(0, 15)
    .map((item) => ({ ...item, claims: (item.extracted_claims ?? []).sort((a: any, b: any) => (b.claim_score ?? 0) - (a.claim_score ?? 0)) }));

  const overallData = extractOverallScore(politicianRow);
  const overallScore = overallData?.overall_score ?? 0;
  const overallConfidence = overallData?.overall_confidence ?? 0;
  const totalEvidence = overallData?.total_evidence_items ?? 0;
  const recommendation = endorsementLabel(overallScore);
  const generatedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 print:py-6">

      {/* Print / back controls — hidden when printing */}
      <div className="flex items-center justify-between mb-8 print:hidden">
        <Link href={`/politicians/${params.id}`} className="text-body-sm text-primary-500 hover:text-primary-950 transition-colors">
          &larr; Back to full profile
        </Link>
        <button
          onClick={() => globalThis.print()}
          className="btn-secondary text-caption py-2 px-4"
        >
          Print / Save PDF
        </button>
      </div>

      {/* Brief header */}
      <div className="mb-8 pb-6" style={{ borderBottom: '2px solid var(--foreground)' }}>
        <p className="text-caption text-primary-400 uppercase tracking-widest mb-1">
          PA Chamber of Commerce — Endorsement Brief
        </p>
        <h1 className="text-heading-1 mb-1">{politician.full_name}</h1>
        <p className="text-body-sm text-primary-500">
          {politician.title}
          {politician.district && `, District ${politician.district}`}
          {politician.county && ` · ${politician.county} County`}
          {' · '}
          {partyLabel(politician.party)}
        </p>
        <p className="text-caption text-primary-400 mt-1">Generated {generatedDate} · Based on {totalEvidence} evidence items</p>
      </div>

      {/* Recommendation banner */}
      <div
        className="rounded-xl p-6 mb-8 flex items-center justify-between"
        style={{ background: recommendation.color, color: 'white' }}
      >
        <div>
          <p className="text-caption uppercase tracking-widest opacity-70 mb-1">Staff Recommendation</p>
          <p className="text-2xl font-bold">{recommendation.label}</p>
        </div>
        <div className="text-right">
          <p className="text-caption uppercase tracking-widest opacity-70 mb-1">Chamber Alignment Score</p>
          <p className="text-4xl font-bold">{Math.round(overallScore * 100)}%</p>
          <p className="text-caption opacity-60">Confidence: {Math.round(overallConfidence * 100)}%</p>
        </div>
      </div>

      {/* Per-principle scores */}
      <div className="mb-8">
        <h2 className="text-heading-3 mb-4">Issue-by-Issue Alignment</h2>
        <div className="space-y-3">
          {Object.entries(PA_CHAMBER_PRINCIPLES).map(([key, principle]) => {
            const ps = principleScores.find((s: any) => s.principle === key);
            const score = ps?.score ?? ((overallData as any)?.[`${key.toLowerCase()}_score`] ?? 0);
            const confidence = ps?.confidence_overall ?? overallConfidence;
            const numItems = ps?.num_evidence_items ?? 0;
            return (
              <div key={key} className="py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <span className="text-body-sm font-semibold text-primary-950">{principle.name}</span>
                    {numItems > 0 && (
                      <span className="text-caption text-primary-400 ml-2">({numItems} items)</span>
                    )}
                  </div>
                  <span className="text-caption text-primary-400 ml-4 whitespace-nowrap">
                    {Math.round(confidence * 100)}% conf.
                  </span>
                </div>
                {scoreBar(score)}
              </div>
            );
          })}
        </div>
      </div>

      {/* Key evidence — cited */}
      <div className="mb-8">
        <h2 className="text-heading-3 mb-1">Key Evidence</h2>
        <p className="text-caption text-primary-400 mb-4">
          Highest-weight evidence items. Each is cited and traceable.
        </p>
        <div className="space-y-4">
          {topEvidence.map((item: any) => (
            <div key={item.id} className="p-4 rounded-xl" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-caption font-semibold px-2 py-0.5 rounded" style={{ background: 'var(--surface-canvas)' }}>
                  {EVIDENCE_TYPE_LABELS[item.evidence_type] || item.evidence_type}
                </span>
                {item.tagged_principles?.map((p: string) => (
                  <span key={p} className="text-caption px-1.5 py-0.5 rounded bg-primary-100 text-primary-600">
                    {PA_CHAMBER_PRINCIPLES[p]?.name ?? p}
                  </span>
                ))}
                <span className="text-caption text-primary-400 ml-auto">
                  {new Date(item.source_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              </div>

              {item.bill_title && (
                <p className="text-body-sm text-primary-950 font-medium mb-1">{item.bill_title}</p>
              )}

              {item.vote_position && (
                <p className="text-body-sm text-primary-500 mb-1">
                  Voted{' '}
                  <span className={item.vote_position === 'yea' ? 'font-bold text-primary-950' : 'text-primary-400'}>
                    {item.vote_position.toUpperCase()}
                  </span>
                </p>
              )}

              {item.claims?.length > 0 && (
                <p className="text-body-sm text-primary-500 italic mt-1">
                  &ldquo;{item.claims[0].claim_text}&rdquo;
                </p>
              )}

              {item.source_text && !item.vote_position && !item.claims?.length && (
                <p className="text-body-sm text-primary-500 line-clamp-2">{item.source_text}</p>
              )}

              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption text-primary-500 underline mt-1 inline-block print:text-primary-400"
                >
                  Source: {item.source_url}
                </a>
              )}
            </div>
          ))}
          {topEvidence.length === 0 && (
            <p className="text-primary-400 text-center py-6">
              No evidence collected yet. Run the pipeline to populate this brief.
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-6 text-caption text-primary-400" style={{ borderTop: '1px solid var(--border)' }}>
        <p>This brief was generated by PA Chamber Endorsement Intelligence and is intended for internal use only.</p>
        <p className="mt-1">All claims are machine-extracted and should be verified by the government affairs team before use in any official endorsement communication.</p>
      </div>

    </main>
  );
}

export const dynamic = 'force-dynamic';
