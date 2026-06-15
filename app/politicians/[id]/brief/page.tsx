import Link from 'next/link';
import Image from 'next/image';
import PrintButton from '@/components/ui/PrintButton';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { PA_CHAMBER_PRINCIPLES } from '@/lib/utils/constants';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PRINCIPLES_ORDER = ['P1','P2','P3','P4','P5','P6','P7','P8','P9'];

type Recommendation = {
  verdict: string;
  verdictShort: string;
  bg: string;
  text: string;
  border: string;
  icon: string;
};

function getRecommendation(score: number, confidence: number, totalEvidence: number): Recommendation {
  if (totalEvidence < 5 || confidence < 0.5) {
    return {
      verdict: 'Insufficient Data — Further Research Required',
      verdictShort: 'INSUFFICIENT DATA',
      bg: '#f3f4f6', text: '#374151', border: '#d1d5db', icon: '⚠',
    };
  }
  if (score >= 0.70) return { verdict: 'Recommend Endorsement', verdictShort: 'ENDORSE', bg: '#0a1628', text: '#ffffff', border: '#0a1628', icon: '✓' };
  if (score >= 0.58) return { verdict: 'Lean Endorse — Conditional on Key Votes', verdictShort: 'LEAN ENDORSE', bg: '#1e3a5f', text: '#ffffff', border: '#1e3a5f', icon: '↑' };
  if (score >= 0.44) return { verdict: 'Neutral — Further Review Recommended', verdictShort: 'NEUTRAL', bg: '#92400e', text: '#ffffff', border: '#92400e', icon: '–' };
  return { verdict: 'Do Not Endorse', verdictShort: 'DO NOT ENDORSE', bg: '#7f1d1d', text: '#ffffff', border: '#7f1d1d', icon: '✗' };
}

function buildSummary(
  politicianName: string,
  party: string,
  score: number,
  confidence: number,
  totalEvidence: number,
  principleScores: any[],
  rec: Recommendation,
): string {
  const pct = Math.round(score * 100);
  const confPct = Math.round(confidence * 100);
  const partyLabel = party === 'R' ? 'Republican' : party === 'D' ? 'Democrat' : 'Independent';

  if (totalEvidence < 5) {
    return `${politicianName} is a ${partyLabel} member for whom insufficient public evidence has been collected to generate a reliable alignment score. The PA Chamber government affairs team should conduct a direct outreach or questionnaire before making an endorsement determination.`;
  }

  const sorted = [...principleScores].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top3 = sorted.slice(0, 3).map(s => PA_CHAMBER_PRINCIPLES[s.principle]?.name ?? s.principle);
  const bottom3 = sorted.slice(-3).filter(s => (s.score ?? 0) < 0.5).map(s => PA_CHAMBER_PRINCIPLES[s.principle]?.name ?? s.principle);

  const strengthStr = top3.length > 0 ? `strongest alignment in ${top3.join(', ')}` : 'limited alignment data';
  const weakStr = bottom3.length > 0 ? ` Areas of concern include ${bottom3.join(' and ')}.` : '';

  const opening = rec.verdictShort === 'ENDORSE'
    ? `${politicianName} presents a strong case for PA Chamber endorsement.`
    : rec.verdictShort === 'LEAN ENDORSE'
    ? `${politicianName} is a viable endorsement candidate with some reservations.`
    : rec.verdictShort === 'NEUTRAL'
    ? `${politicianName} presents a mixed record relative to PA Chamber priorities.`
    : `${politicianName}'s legislative record does not align sufficiently with PA Chamber priorities to support endorsement at this time.`;

  return `${opening} Based on ${totalEvidence} evidence items analyzed with ${confPct}% confidence, this ${partyLabel} member scores ${pct}% overall on the Chamber's nine business priorities — ${strengthStr}.${weakStr} This brief is generated from public legislative data including floor votes, bill sponsorships, news coverage, and social media. Human review of the cited evidence is recommended before finalizing any endorsement decision.`;
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
      .select('id, evidence_type, bill_title, vote_position, source_text, source_url, source_date, tagged_principles, extracted_claims(claim_text, stance, strength, principle)')
      .eq('politician_id', params.id)
      .eq('is_relevant', true)
      .order('source_date', { ascending: false })
      .limit(200),
  ]);

  const politician = politicianRow;
  const principleScores = rawPrincipleScores ?? [];
  const evidence = evidenceData ?? [];

  const overallData = extractOverallScore(politicianRow);
  const overallScore = overallData?.overall_score ?? 0;
  const overallConfidence = overallData?.overall_confidence ?? 0;
  const totalEvidence = overallData?.total_evidence_items ?? 0;
  const rec = getRecommendation(overallScore, overallConfidence, totalEvidence);

  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Group evidence by principle
  const byPrinciple: Record<string, typeof evidence> = {};
  for (const item of evidence) {
    for (const p of (item.tagged_principles ?? [])) {
      if (!byPrinciple[p]) byPrinciple[p] = [];
      byPrinciple[p].push(item);
    }
  }

  // All extracted claims across all evidence
  const allClaims = evidence.flatMap((e: any) =>
    (e.extracted_claims ?? []).map((c: any) => ({ ...c, source_url: e.source_url, evidence_type: e.evidence_type, source_date: e.source_date }))
  );

  const supportClaims = allClaims.filter((c: any) => c.stance === 'support').slice(0, 6);
  const opposeClaims = allClaims.filter((c: any) => c.stance === 'oppose').slice(0, 4);

  // Key floor votes
  const keyVotes = evidence.filter(e => e.evidence_type === 'floor_vote').slice(0, 8);

  // Principles with no data
  const missingPrinciples = PRINCIPLES_ORDER.filter(k => !principleScores.find((s: any) => s.principle === k && (s.num_evidence_items ?? 0) > 0));

  const summary = buildSummary(
    politician.full_name,
    politician.party,
    overallScore,
    overallConfidence,
    totalEvidence,
    principleScores,
    rec,
  );

  const partyLabel = politician.party === 'R' ? 'Republican' : politician.party === 'D' ? 'Democrat' : 'Independent';

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 print:py-4 print:px-4">

      {/* Controls */}
      <div className="flex items-center justify-between mb-8 print:hidden">
        <Link href={`/politicians/${params.id}`} className="text-body-sm text-primary-500 hover:text-primary-950 transition-colors">
          &larr; Back to profile
        </Link>
        <PrintButton />
      </div>

      {/* Letterhead */}
      <div className="flex items-start justify-between mb-6 pb-5" style={{ borderBottom: '3px solid #0a1628' }}>
        <div>
          <p className="text-caption font-bold uppercase tracking-widest text-primary-400 mb-1">
            PA Chamber of Commerce
          </p>
          <p className="text-caption text-primary-400">Endorsement Intelligence Brief · Confidential</p>
          <p className="text-caption text-primary-300 mt-0.5">Generated {generatedDate}</p>
        </div>
        <div className="text-right">
          <p className="text-caption text-primary-400">2026 PA House Election</p>
          <p className="text-caption text-primary-300 mt-0.5">Based on {totalEvidence} evidence items</p>
        </div>
      </div>

      {/* Subject header */}
      <div className="flex items-center gap-5 mb-6">
        {politician.photo_url && (
          <div className="relative w-20 h-20 rounded-full overflow-hidden flex-shrink-0 print:hidden" style={{ border: '2px solid #c9a84c' }}>
            <Image src={politician.photo_url} alt={politician.full_name} fill className="object-cover" style={{ objectPosition: '50% 15%' }} />
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-primary-950">{politician.full_name}</h1>
          <p className="text-body-sm text-primary-500 mt-0.5">
            {partyLabel}
            {politician.district && ` · District ${politician.district}`}
            {politician.county && ` · ${politician.county}`}
          </p>
          {politician.official_website && (
            <a href={politician.official_website} target="_blank" rel="noopener noreferrer" className="text-caption text-primary-400 underline hover:text-primary-700 transition-colors print:no-underline">
              {politician.official_website}
            </a>
          )}
        </div>
      </div>

      {/* VERDICT BANNER */}
      <div
        className="rounded-2xl p-6 mb-8 print:rounded-none print:mb-6"
        style={{ background: rec.bg, color: rec.text, border: `2px solid ${rec.border}` }}
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">PA Chamber Staff Recommendation</p>
            <p className="text-3xl font-bold">{rec.icon} {rec.verdict}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Overall Alignment</p>
            <p className="text-5xl font-bold">{Math.round(overallScore * 100)}%</p>
            <p className="text-xs opacity-60 mt-0.5">Confidence: {Math.round(overallConfidence * 100)}%</p>
          </div>
        </div>
      </div>

      {/* EXECUTIVE SUMMARY */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-primary-950 mb-3 uppercase tracking-wide" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
          Executive Summary
        </h2>
        <p className="text-body-sm text-primary-700 leading-relaxed">{summary}</p>
      </section>

      {/* ISSUE-BY-ISSUE BREAKDOWN */}
      <section className="mb-8">
        <h2 className="text-lg font-bold text-primary-950 mb-4 uppercase tracking-wide" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
          Issue-by-Issue Breakdown
        </h2>
        <div className="space-y-4">
          {PRINCIPLES_ORDER.map((key) => {
            const ps = principleScores.find((s: any) => s.principle === key);
            const principle = PA_CHAMBER_PRINCIPLES[key];
            const score = ps?.score ?? 0;
            const pct = Math.round(score * 100);
            const numItems = ps?.num_evidence_items ?? 0;
            const numVotes = ps?.num_votes ?? 0;
            const numSponsorships = ps?.num_sponsorships ?? 0;
            const noData = numItems === 0;
            const principleEvidence = (byPrinciple[key] ?? []).slice(0, 3);

            const scoreColor = score >= 0.65 ? '#166534' : score >= 0.50 ? '#92400e' : '#991b1b';
            const scoreBg = score >= 0.65 ? '#dcfce7' : score >= 0.50 ? '#fef3c7' : '#fee2e2';

            return (
              <div key={key} className="rounded-xl p-4" style={{ border: '1px solid #e2e8f0' }}>
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: '#f1f5f9', color: '#64748b' }}>{key}</span>
                      <span className="font-bold text-primary-950 text-body-sm">{principle?.name}</span>
                    </div>
                    {principle?.description && (
                      <p className="text-caption text-primary-400 mt-0.5 leading-snug">{principle.description}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {noData ? (
                      <span className="text-caption font-semibold px-2.5 py-1 rounded-full" style={{ background: '#f3f4f6', color: '#9ca3af' }}>No Data</span>
                    ) : (
                      <span className="text-lg font-bold px-3 py-1 rounded-full" style={{ background: scoreBg, color: scoreColor }}>{pct}%</span>
                    )}
                  </div>
                </div>

                {!noData && (
                  <>
                    {/* Score bar */}
                    <div className="h-1.5 rounded-full mb-2" style={{ background: '#f1f5f9' }}>
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: scoreColor }} />
                    </div>

                    {/* Evidence summary */}
                    <div className="flex gap-4 flex-wrap mb-2">
                      {numVotes > 0 && <span className="text-caption text-primary-500">🗳 {numVotes} floor vote{numVotes !== 1 ? 's' : ''}</span>}
                      {numSponsorships > 0 && <span className="text-caption text-primary-500">📋 {numSponsorships} bill{numSponsorships !== 1 ? 's' : ''} sponsored/co-sponsored</span>}
                      {numItems - numVotes - numSponsorships > 0 && <span className="text-caption text-primary-500">📰 {numItems - numVotes - numSponsorships} news/social items</span>}
                    </div>

                    {/* Key evidence bullets */}
                    {principleEvidence.length > 0 && (
                      <ul className="space-y-1 mt-2">
                        {principleEvidence.map((item: any) => {
                          const claim = item.extracted_claims?.[0];
                          const label = item.evidence_type === 'floor_vote'
                            ? `${item.vote_position?.toUpperCase() ?? 'VOTED'} — ${item.bill_title ?? 'Bill vote'}`
                            : item.evidence_type === 'bill_sponsorship'
                            ? `Sponsored: ${item.bill_title ?? 'Bill'}`
                            : item.evidence_type === 'bill_cosponsorship'
                            ? `Co-sponsored: ${item.bill_title ?? 'Bill'}`
                            : item.source_text?.substring(0, 100) ?? '';
                          return (
                            <li key={item.id} className="text-caption text-primary-600 flex items-start gap-1.5">
                              <span className="text-primary-300 mt-0.5 flex-shrink-0">•</span>
                              <span>
                                {label}
                                {claim && (
                                  <span className="text-primary-400 italic"> — &ldquo;{claim.claim_text?.substring(0, 100)}&rdquo;</span>
                                )}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                )}

                {noData && (
                  <p className="text-caption text-primary-300 italic mt-1">
                    No public record found for this priority area. Direct outreach or questionnaire recommended.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* KEY POSITIONS */}
      {(supportClaims.length > 0 || opposeClaims.length > 0) && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-primary-950 mb-4 uppercase tracking-wide" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
            Key Positions & Statements
          </h2>

          {supportClaims.length > 0 && (
            <div className="mb-4">
              <p className="text-caption font-bold uppercase tracking-wide text-green-700 mb-2">Positions Aligned with Chamber</p>
              <ul className="space-y-2">
                {supportClaims.map((c: any, i: number) => (
                  <li key={i} className="text-caption flex items-start gap-2 p-3 rounded-lg" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <span className="text-green-600 font-bold flex-shrink-0 mt-0.5">✓</span>
                    <span className="text-primary-700">{c.claim_text}</span>
                    {c.principle && <span className="ml-auto flex-shrink-0 text-xs font-semibold text-green-600">{c.principle}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {opposeClaims.length > 0 && (
            <div>
              <p className="text-caption font-bold uppercase tracking-wide text-red-700 mb-2">Positions Against Chamber Priorities</p>
              <ul className="space-y-2">
                {opposeClaims.map((c: any, i: number) => (
                  <li key={i} className="text-caption flex items-start gap-2 p-3 rounded-lg" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <span className="text-red-600 font-bold flex-shrink-0 mt-0.5">✗</span>
                    <span className="text-primary-700">{c.claim_text}</span>
                    {c.principle && <span className="ml-auto flex-shrink-0 text-xs font-semibold text-red-600">{c.principle}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* KEY FLOOR VOTES */}
      {keyVotes.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-primary-950 mb-4 uppercase tracking-wide" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
            Floor Vote Record
          </h2>
          <div className="space-y-2">
            {keyVotes.map((v: any) => {
              const isYea = v.vote_position?.toLowerCase() === 'yea';
              return (
                <div key={v.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg" style={{ border: '1px solid #f1f5f9' }}>
                  <span
                    className="flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded"
                    style={{ background: isYea ? '#dcfce7' : '#fee2e2', color: isYea ? '#166534' : '#991b1b', minWidth: 40, textAlign: 'center' }}
                  >
                    {v.vote_position?.toUpperCase() ?? '—'}
                  </span>
                  <span className="flex-1 text-caption text-primary-800">{v.bill_title ?? 'Floor vote'}</span>
                  {v.tagged_principles?.length > 0 && (
                    <span className="text-xs text-primary-400 flex-shrink-0">{v.tagged_principles.join(', ')}</span>
                  )}
                  <span className="text-caption text-primary-300 flex-shrink-0">
                    {v.source_date ? new Date(v.source_date).getFullYear() : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* DATA GAPS */}
      {missingPrinciples.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-primary-950 mb-3 uppercase tracking-wide" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
            Data Gaps — Action Required
          </h2>
          <p className="text-caption text-primary-500 mb-3">
            No public evidence found for the following Chamber priorities. Scores in these areas default to neutral (50%) and reduce overall confidence.
            The government affairs team should request a questionnaire response or schedule a direct conversation.
          </p>
          <div className="flex flex-wrap gap-2">
            {missingPrinciples.map(key => (
              <span key={key} className="text-caption px-3 py-1.5 rounded-full font-semibold" style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>
                {key}: {PA_CHAMBER_PRINCIPLES[key]?.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* FOOTER */}
      <div className="pt-5 text-caption text-primary-400 leading-relaxed" style={{ borderTop: '2px solid #0a1628' }}>
        <p className="font-semibold text-primary-600 mb-1">PA Chamber of Commerce — For Internal Use Only</p>
        <p>This brief is machine-generated from public legislative records and AI-extracted claims. All scores and positions should be verified by the government affairs team before use in any official endorsement communication. Chamber alignment scores are based on the nine PA Chamber business priorities and do not reflect the Chamber's official position on any individual.</p>
        <p className="mt-2">Evidence sources: PA General Assembly records, LegiScan legislative data, Google News, Bluesky, YouTube. Pipeline last run: {generatedDate}.</p>
      </div>

    </main>
  );
}

export const dynamic = 'force-dynamic';
