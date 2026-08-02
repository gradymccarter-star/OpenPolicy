import Link from 'next/link';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { rescaleScore, getCandidacyStatus } from '@/lib/utils/helpers';
import { getDistrictOdds, getNormalizedScore } from '@/lib/data/static-data';
import { computeEndorsementTier, deriveOwnWinProbability, TIER_LABELS, TIER_DESCRIPTIONS, type EndorsementTier } from '@/lib/utils/endorsement-priority';
import { PartyBadge, CandidacyBadge } from '@/components/ui/Badge';
import type { PoliticianWithScores } from '@/lib/utils/types';

interface RankedCandidate {
  politician: PoliticianWithScores;
  alignmentPct: number;
  ownWinProbabilityPct: number | null;
}

interface UnscoredCandidate {
  politician: PoliticianWithScores;
  ownWinProbabilityPct: number | null;
}

const TIER_ORDER: EndorsementTier[] = ['priority', 'strong_ally', 'safe_ally', 'promising_limited_evidence', 'longshot_ally', 'not_recommended'];

const TIER_COLOR: Record<EndorsementTier, { color: string; bg: string }> = {
  priority: { color: 'var(--verdigris)', bg: 'rgba(47,111,82,0.1)' },
  strong_ally: { color: 'var(--verdigris)', bg: 'rgba(47,111,82,0.06)' },
  safe_ally: { color: 'var(--brass)', bg: 'var(--brass-wash)' },
  promising_limited_evidence: { color: '#8b6bb0', bg: 'rgba(139,107,176,0.08)' },
  longshot_ally: { color: 'var(--ink-secondary)', bg: 'var(--well)' },
  not_recommended: { color: 'var(--oxblood)', bg: 'rgba(158,59,49,0.06)' },
};

interface EndorsementData {
  byTier: Record<EndorsementTier, RankedCandidate[]>;
  unscored: UnscoredCandidate[];
}

async function getRankedCandidates(): Promise<EndorsementData> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('politicians')
    .select('*, overall_scores(*)')
    .eq('is_active', true)
    .eq('office_type', 'pa_house');

  if (error) throw error;

  const byTier: Record<EndorsementTier, RankedCandidate[]> = {
    priority: [],
    strong_ally: [],
    safe_ally: [],
    promising_limited_evidence: [],
    longshot_ally: [],
    not_recommended: [],
  };
  const unscored: UnscoredCandidate[] = [];

  for (const row of data ?? []) {
    const politician = { ...row, overall_score: extractOverallScore(row) } as PoliticianWithScores;
    const overall = politician.overall_score;
    const odds = politician.district ? getDistrictOdds(politician.district) : null;

    if (!overall || (overall.total_evidence_items ?? 0) === 0) {
      // No legislative record and (so far) no other evidence — most common for
      // challengers, who can't generate votes/sponsorships. Not "not recommended",
      // just not yet assessable — surfaced separately rather than silently dropped.
      unscored.push({
        politician,
        ownWinProbabilityPct: (() => {
          const p = deriveOwnWinProbability(politician.party, odds?.dem_win_probability ?? null);
          return p != null ? Math.round(p * 100) : null;
        })(),
      });
      continue;
    }

    const rescaledScore = rescaleScore(overall.overall_score);
    const percentile = getNormalizedScore(overall.overall_score) ?? 0;

    const result = computeEndorsementTier({
      party: politician.party,
      percentile,
      overallConfidence: overall.overall_confidence ?? 0,
      demWinProbability: odds?.dem_win_probability ?? null,
    });

    byTier[result.tier].push({
      politician,
      alignmentPct: Math.round(rescaledScore * 100),
      ownWinProbabilityPct: result.ownWinProbability != null ? Math.round(result.ownWinProbability * 100) : null,
    });
  }

  for (const tier of TIER_ORDER) {
    byTier[tier].sort((a, b) => b.alignmentPct - a.alignmentPct);
  }
  // Highest-odds-uncertainty (closest to 50%) first — these are the challengers where
  // getting a questionnaire response would matter most.
  unscored.sort((a, b) => {
    const da = a.ownWinProbabilityPct == null ? 999 : Math.abs(a.ownWinProbabilityPct - 50);
    const db = b.ownWinProbabilityPct == null ? 999 : Math.abs(b.ownWinProbabilityPct - 50);
    return da - db;
  });

  return { byTier, unscored };
}

export default async function EndorsementsPage() {
  let byTier: Record<EndorsementTier, RankedCandidate[]> = {
    priority: [],
    strong_ally: [],
    safe_ally: [],
    promising_limited_evidence: [],
    longshot_ally: [],
    not_recommended: [],
  };
  let unscored: UnscoredCandidate[] = [];

  try {
    const result = await getRankedCandidates();
    byTier = result.byTier;
    unscored = result.unscored;
  } catch (error) {
    console.error('Failed to load endorsement recommendations:', error);
  }

  const totalRanked = TIER_ORDER.reduce((sum, t) => sum + byTier[t].length, 0);
  const priorityCount = byTier.priority.length;
  const unscoredIncumbents = unscored.filter((u) => getCandidacyStatus(u.politician) === 'incumbent').length;
  const unscoredChallengers = unscored.length - unscoredIncumbents;

  return (
    <main className="container-page py-10">
      <div className="mb-6">
        <p className="overline">2026 Pennsylvania House of Representatives</p>
        <h1 className="text-heading-1 mt-3 mb-1">Endorsement Recommendations</h1>
        <p className="text-body-sm text-primary-500 max-w-3xl">
          Ranks every scored candidate by combining their Chamber alignment score with their district&apos;s estimated win odds.
          A safe seat needs no endorsement to hold; a longshot won&apos;t be saved by one — the highest-leverage endorsements
          are strong-alignment candidates in genuinely competitive races. <span className="figure">{priorityCount}</span> priority
          {priorityCount === 1 ? ' endorsement' : ' endorsements'} identified across <span className="figure">{totalRanked}</span> scored candidates.
          {unscored.length > 0 && (
            <> <span className="figure">{unscored.length}</span> more ({unscoredIncumbents > 0 && <><span className="figure">{unscoredIncumbents}</span> incumbent{unscoredIncumbents === 1 ? '' : 's'}, </>}
            <span className="figure">{unscoredChallengers}</span> challenger{unscoredChallengers === 1 ? '' : 's'}) have no score yet.</>
          )}
        </p>
      </div>

      <div className="card p-5 mb-8" style={{ borderLeft: '4px solid var(--brass-bright)' }}>
        <p className="text-caption font-semibold uppercase tracking-wide text-primary-400 mb-2">Methodology</p>
        <p className="text-caption text-primary-600 leading-relaxed mb-2">
          Alignment: <strong>High</strong> is the top quartile of all scored candidates by Chamber-alignment percentile, <strong>Moderate</strong> the
          50th-75th percentile, <strong>Low</strong> below the 50th — relative, not a fixed score cutoff, since SCAI scores cluster tightly.
          Only High-alignment candidates receive a positive tier. Competitiveness uses the candidate&apos;s own estimated win probability
          (not the district&apos;s — a Republican in a &quot;Safe D&quot; district has a low chance regardless of who they are):
          {' '}<strong>Safe</strong> 90%+, <strong>Likely</strong> 70-90%, <strong>Competitive</strong> 15-70%, <strong>Long-shot</strong> below 15%.
          A High-alignment score built on too little evidence (below medium confidence — often a single candidate survey response with nothing to average
          it against) is held out as <strong>Promising — Limited Evidence</strong> instead of any of the above, regardless of how competitive the race is.
        </p>
        <p className="text-caption text-primary-400">
          Both inputs are AI-generated estimates from this site&apos;s own data — not an official PA Chamber of Commerce position or endorsement.
        </p>
      </div>

      <div className="space-y-8">
        {TIER_ORDER.map((tier) => {
          const candidates = byTier[tier];
          if (candidates.length === 0) return null;
          const tierColor = TIER_COLOR[tier];
          return (
            <details key={tier} open={tier !== 'not_recommended'}>
              <summary className="cursor-pointer list-none">
                <div className="flex items-center gap-3 mb-1">
                  <span
                    className="font-semibold rounded-sm px-2 py-0.5 tracking-wide text-caption"
                    style={{ color: tierColor.color, background: tierColor.bg }}
                  >
                    {TIER_LABELS[tier]}
                  </span>
                  <span className="figure text-caption text-primary-400">{candidates.length}</span>
                </div>
                <p className="text-caption text-primary-500 mb-4">{TIER_DESCRIPTIONS[tier]}</p>
              </summary>

              <div className="card divide-y" style={{ borderColor: 'var(--rule)' }}>
                {candidates.map(({ politician, alignmentPct, ownWinProbabilityPct }) => (
                  <Link
                    key={politician.id}
                    href={`/politicians/${politician.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-primary-50 transition-colors"
                    style={{ borderColor: 'var(--rule-soft)' }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <PartyBadge party={politician.party} />
                      <span className="text-body-sm font-medium text-primary-950 truncate">{politician.full_name}</span>
                      {politician.district && (
                        <span className="text-caption text-primary-400 flex-shrink-0">
                          HD-<span className="figure">{politician.district}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 text-caption">
                      <span className="text-primary-500">
                        <span className="figure font-semibold text-primary-950">{alignmentPct}%</span> aligned
                      </span>
                      <span className="text-primary-500">
                        {ownWinProbabilityPct != null ? (
                          <><span className="figure font-semibold text-primary-950">{ownWinProbabilityPct}%</span> win odds</>
                        ) : (
                          'odds unavailable'
                        )}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </details>
          );
        })}

        {unscored.length > 0 && (
          <details>
            <summary className="cursor-pointer list-none">
              <div className="flex items-center gap-3 mb-1">
                <span
                  className="font-semibold rounded-sm px-2 py-0.5 tracking-wide text-caption"
                  style={{ color: 'var(--ink-secondary)', background: 'var(--well)' }}
                >
                  Not Yet Scored
                </span>
                <span className="figure text-caption text-primary-400">{unscored.length}</span>
              </div>
              <p className="text-caption text-primary-500 mb-4">
                No Chamber alignment score yet — mostly challengers with no legislative voting record and no completed candidate
                survey on file. Not the same as &quot;Not Recommended&quot;: we simply don&apos;t have enough to assess them.
                Sorted by how close their district race is, since that&apos;s where getting a questionnaire response would matter most.
              </p>
            </summary>

            <div className="card divide-y" style={{ borderColor: 'var(--rule)' }}>
              {unscored.map(({ politician, ownWinProbabilityPct }) => (
                <Link
                  key={politician.id}
                  href={`/politicians/${politician.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-primary-50 transition-colors"
                  style={{ borderColor: 'var(--rule-soft)' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PartyBadge party={politician.party} />
                    <CandidacyBadge status={getCandidacyStatus(politician)} />
                    <span className="text-body-sm font-medium text-primary-950 truncate">{politician.full_name}</span>
                    {politician.district && (
                      <span className="text-caption text-primary-400 flex-shrink-0">
                        HD-<span className="figure">{politician.district}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-caption">
                    <span className="text-primary-500">
                      {ownWinProbabilityPct != null ? (
                        <><span className="figure font-semibold text-primary-950">{ownWinProbabilityPct}%</span> win odds</>
                      ) : (
                        'odds unavailable'
                      )}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </details>
        )}
      </div>
    </main>
  );
}

export const dynamic = 'force-dynamic';
