'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import PoliticianCard from '@/components/politicians/PoliticianCard';
import { CandidacyBadge, PartyBadge } from '@/components/ui/Badge';
import type { LeadershipTier } from '@/lib/data/contact-info';
import { getCandidacyStatus, rescaleScore } from '@/lib/utils/helpers';
import type { ElectionHistoryFile, ElectionYearResult, PoliticianWithScores } from '@/lib/utils/types';
import PADistrictMap, { type DistrictGeoJSON } from './PADistrictMap';

const TOTAL_DISTRICTS = 203;

type ColorMode = 'party' | 'score' | 'funding' | 'contested' | 'leadership' | `year:${string}`;

interface Props {
  readonly geojson: DistrictGeoJSON;
  readonly politiciansByDistrict: Record<string, PoliticianWithScores[]>;
  readonly fundingIds: string[];
  readonly fundingTotals: Record<string, number>;
  readonly electionHistory: ElectionHistoryFile | null;
  readonly initialDistrict: string | null;
  readonly committeeRoleById?: Record<string, string>;
  readonly leadershipTierById?: Record<string, LeadershipTier>;
  readonly normalizedScoresById?: Record<string, number | null>;
}

const LEADERSHIP_LABELS: Record<LeadershipTier, string> = {
  chair: 'Committee Chair',
  'subcommittee-chair': 'Subcommittee Chair',
  officer: 'Vice Chair / Secretary',
  member: 'Committee Member',
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

const NEUTRAL_FILL = 'var(--well)';
// Districts with no candidate or no scoring data at all get diagonal hatching (defined in PADistrictMap defs)
const NO_DATA_FILL = 'url(#no-data-hatch)';

// Sanctioned desaturated institutional party colors (democrat-600 / republican-600),
// with lighter lean tints (democrat-200 / republican-200). Party identity only.
const PARTY_FILL: Record<string, string> = { D: '#2b5c8a', R: '#a13d33', I: '#5c6375' };
const PARTY_TINT: Record<string, string> = { D: '#c2d6e8', R: '#e5c2bd' };

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [239, 236, 227]; // var(--well)
  return [Number.parseInt(m[1], 16), Number.parseInt(m[2], 16), Number.parseInt(m[3], 16)];
}

function lerpColor(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}

// Muted, on-brand gradient (oxblood -> brass -> verdigris, the same institutional
// palette used for funding alignment elsewhere) rather than 5 hard-coded, saturated
// stock-color bands — every district gets a shade proportional to its exact score.
const SCORE_GRADIENT_LOW = '#9e3b31'; // oxblood
const SCORE_GRADIENT_MID = '#c9a84c'; // brass-bright
const SCORE_GRADIENT_HIGH = '#2f6f52'; // verdigris
const SCORE_GRADIENT_CSS = `linear-gradient(to right, ${SCORE_GRADIENT_LOW}, ${SCORE_GRADIENT_MID}, ${SCORE_GRADIENT_HIGH})`;

function getScoreMapFill(scaledScore: number): string {
  // Renormalize the realistic 0.2-0.9 display range (see rescaleScore) to 0-1 so the
  // full gradient spread is used rather than compressing colors into the middle.
  const t = Math.max(0, Math.min(1, (scaledScore - 0.2) / 0.7));
  if (t <= 0.5) return lerpColor(SCORE_GRADIENT_LOW, SCORE_GRADIENT_MID, t / 0.5);
  return lerpColor(SCORE_GRADIENT_MID, SCORE_GRADIENT_HIGH, (t - 0.5) / 0.5);
}

/** Blend the light party tint toward the full party color as margin widens, so close races read lighter than blowouts. */
function fillForMargin(winner: string | null, marginPct: number | null): string {
  if (!winner || marginPct === null) return NEUTRAL_FILL;
  const base = PARTY_FILL[winner];
  if (!base) return NEUTRAL_FILL;
  const tint = PARTY_TINT[winner] ?? base;
  // Saturate fully by a 30-point margin; a near-tie (0pt) shows the light lean tint.
  const t = Math.min(1, marginPct / 30);
  const [r1, g1, b1] = hexToRgb(tint);
  const [r2, g2, b2] = hexToRgb(base);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`;
}

export default function OverviewMapClient({ geojson, politiciansByDistrict, fundingIds, fundingTotals, electionHistory, initialDistrict, committeeRoleById = {}, leadershipTierById = {}, normalizedScoresById = {} }: Props) {
  const [view, setView] = useState<'map' | 'table'>('map');
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(initialDistrict);
  const [hoveredDistrict, setHoveredDistrict] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>('party');
  const [search, setSearch] = useState('');

  const fundingSet = useMemo(() => new Set(fundingIds), [fundingIds]);
  const historyYears = useMemo(
    () => Object.keys(electionHistory?.sources ?? {}).sort((a, b) => Number(b) - Number(a)),
    [electionHistory],
  );

  const districtFunding = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const [district, reps] of Object.entries(politiciansByDistrict)) {
      totals[district] = reps.reduce((s, r) => s + (fundingTotals[r.id] ?? 0), 0);
    }
    return totals;
  }, [politiciansByDistrict, fundingTotals]);
  const maxDistrictFunding = useMemo(
    () => Math.max(1, ...Object.values(districtFunding)),
    [districtFunding],
  );

  // var(--brass-bright) / var(--ink) / var(--ink-faint) — kept as raw hex because the
  // heatmap blend math needs RGB channels, which CSS custom properties can't provide here.
  const BRASS_BRIGHT = '#c9a84c';
  const INK = '#131a26';
  const INK_FAINT = '#c6c8ce';
  const CONTESTED_COLOR = 'var(--ink)';
  const UNCONTESTED_COLOR = 'var(--ink-faint)';
  const FUNDING_GRADIENT_CSS = `linear-gradient(to right, var(--well), ${BRASS_BRIGHT})`;
  const CONTESTED_GRADIENT_CSS = `linear-gradient(to right, ${UNCONTESTED_COLOR}, ${CONTESTED_COLOR})`;

  /**
   * Brass heatmap, intensity scaled relative to the highest-funded district on the board.
   * Campaign finance is heavily skewed toward a handful of top fundraisers, so a linear
   * scale left most districts nearly indistinguishable pale — sqrt spreads the mid-range
   * out so ordinary differences in funding actually read on the map.
   */
  function fillForFunding(amount: number): string {
    if (amount <= 0) return NEUTRAL_FILL;
    const [r, g, b] = hexToRgb(BRASS_BRIGHT);
    const intensity = Math.min(1, 0.2 + 0.8 * Math.sqrt(amount / maxDistrictFunding));
    const blend = (channel: number) => Math.round(channel + (255 - channel) * (1 - intensity));
    return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
  }

  /** Graduated by candidate count rather than a flat binary split — 3+ candidate primaries
   * read as more contested than a standard 2-candidate race. */
  function fillForContested(count: number): string {
    const intensity = Math.max(0, Math.min(1, (count - 1) / 2));
    const [r, g, b] = hexToRgb(INK);
    const [fr, fg, fb] = hexToRgb(INK_FAINT);
    const blend = (base: number, faint: number) => Math.round(faint + (base - faint) * intensity);
    return `rgb(${blend(r, fr)}, ${blend(g, fg)}, ${blend(b, fb)})`;
  }

  const LEADERSHIP_INTENSITY: Record<LeadershipTier, number> = {
    chair: 1,
    'subcommittee-chair': 0.7,
    officer: 0.45,
    member: 0.22,
  };

  /** Brass heatmap by committee leadership tier — full chairs darkest, plain members lightest. */
  function fillForLeadership(tier: LeadershipTier | null): string {
    if (!tier) return NEUTRAL_FILL;
    const [r, g, b] = hexToRgb(BRASS_BRIGHT);
    const blend = (channel: number) => Math.round(channel + (255 - channel) * (1 - LEADERSHIP_INTENSITY[tier]));
    return `rgb(${blend(r)}, ${blend(g)}, ${blend(b)})`;
  }

  function districtLeadershipTier(district: string): LeadershipTier | null {
    const reps = politiciansByDistrict[district];
    if (!reps) return null;
    let best: LeadershipTier | null = null;
    const RANK: Record<LeadershipTier, number> = { chair: 4, 'subcommittee-chair': 3, officer: 2, member: 1 };
    for (const r of reps) {
      const tier = leadershipTierById[r.id];
      if (tier && (!best || RANK[tier] > RANK[best])) best = tier;
    }
    return best;
  }

  const getFill = (district: string): string => {
    if (colorMode.startsWith('year:')) {
      const year = colorMode.slice(5);
      const result = electionHistory?.districts[district]?.[year];
      if (!result) return NEUTRAL_FILL;
      return fillForMargin(result.winner_party, result.margin_pct);
    }
    if (colorMode === 'funding') {
      return fillForFunding(districtFunding[district] ?? 0);
    }
    if (colorMode === 'leadership') {
      return fillForLeadership(districtLeadershipTier(district));
    }
    const reps = politiciansByDistrict[district];
    if (!reps || reps.length === 0) return NO_DATA_FILL;
    if (colorMode === 'contested') {
      return fillForContested(reps.length);
    }
    if (colorMode === 'party') {
      // Show who currently holds the seat, not a blank fill just because a declared
      // opposing-party challenger also exists — that's true of most contested districts.
      const incumbent = reps.find((r) => getCandidacyStatus(r) === 'incumbent');
      const primary = incumbent ?? reps[0];
      return PARTY_FILL[primary.party] || NEUTRAL_FILL;
    }
    // Score mode — use only reps that have actual scoring data
    const scoredReps = reps.filter((r) => (r.overall_score?.total_evidence_items ?? 0) > 0);
    if (scoredReps.length === 0) return NO_DATA_FILL;
    const avgRaw = scoredReps.reduce((s, r) => s + (r.overall_score?.overall_score ?? 0), 0) / scoredReps.length;
    return getScoreMapFill(rescaleScore(avgRaw));
  };

  const selectedReps = selectedDistrict ? politiciansByDistrict[selectedDistrict] ?? [] : [];
  const hoveredName = hoveredDistrict
    ? (politiciansByDistrict[hoveredDistrict]?.[0]?.full_name ?? null)
    : null;
  const hoveredLeadershipTier = hoveredDistrict && colorMode === 'leadership' ? districtLeadershipTier(hoveredDistrict) : null;
  const selectedHistory = selectedDistrict ? electionHistory?.districts[selectedDistrict] : undefined;

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: { district: string; label: string }[] = [];
    for (const [district, reps] of Object.entries(politiciansByDistrict)) {
      const match = reps.find((r) => r.full_name.toLowerCase().includes(q));
      if (match) results.push({ district, label: `${match.full_name} — HD-${district}` });
      else if (district.includes(q)) results.push({ district, label: `HD-${district}` });
    }
    return results.slice(0, 8);
  }, [search, politiciansByDistrict]);

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1 p-1 rounded-md w-fit" style={{ background: 'var(--well)', border: '1px solid var(--rule)' }}>
          <button
            onClick={() => setView('map')}
            className="px-3 py-1.5 rounded-sm text-caption font-semibold transition-colors"
            style={view === 'map' ? { background: 'var(--ink)', color: 'var(--paper)' } : { color: 'var(--ink-secondary)' }}
          >
            Map View
          </button>
          <button
            onClick={() => setView('table')}
            className="px-3 py-1.5 rounded-sm text-caption font-semibold transition-colors"
            style={view === 'table' ? { background: 'var(--ink)', color: 'var(--paper)' } : { color: 'var(--ink-secondary)' }}
          >
            Table View
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Jump to representative or district..."
            className="w-full px-3 py-1.5 rounded-md text-caption outline-none"
            style={{ border: '1px solid var(--rule)', background: 'var(--well)', color: 'var(--ink)', transition: 'border-color 0.15s ease' }}
            onFocus={(e) => { e.target.style.borderColor = 'var(--ink)'; }}
            onBlur={(e) => { e.target.style.borderColor = 'var(--rule)'; }}
          />
          {searchMatches.length > 0 && (
            <div
              className="card absolute z-10 mt-1 w-full overflow-hidden"
              style={{ borderColor: 'var(--rule-strong)' }}
            >
              {searchMatches.map((m) => (
                <button
                  key={m.district}
                  onClick={() => {
                    setView('map');
                    setSelectedDistrict(m.district);
                    setSearch('');
                  }}
                  className="block w-full text-left px-3 py-2 text-caption text-primary-700 hover:bg-primary-100 transition-colors"
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {view === 'table' && (
        <DistrictTable
          politiciansByDistrict={politiciansByDistrict}
          fundingTotals={fundingTotals}
          electionHistory={electionHistory}
          historyYears={historyYears}
          committeeRoleById={committeeRoleById}
        />
      )}

      {view === 'map' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <div>
            {/* Legend + toggle */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-1 p-1 rounded-md flex-wrap" style={{ background: 'var(--well)', border: '1px solid var(--rule)' }}>
                <button
                  onClick={() => setColorMode('party')}
                  className="px-3 py-1.5 rounded-sm text-caption font-semibold transition-colors"
                  style={colorMode === 'party' ? { background: 'var(--ink)', color: 'var(--paper)' } : { color: 'var(--ink-secondary)' }}
                >
                  By Party
                </button>
                <button
                  onClick={() => setColorMode('score')}
                  className="px-3 py-1.5 rounded-sm text-caption font-semibold transition-colors"
                  style={colorMode === 'score' ? { background: 'var(--ink)', color: 'var(--paper)' } : { color: 'var(--ink-secondary)' }}
                >
                  By Chamber Score
                </button>
                <button
                  onClick={() => setColorMode('funding')}
                  className="px-3 py-1.5 rounded-sm text-caption font-semibold transition-colors"
                  style={colorMode === 'funding' ? { background: 'var(--ink)', color: 'var(--paper)' } : { color: 'var(--ink-secondary)' }}
                >
                  By Funding Raised
                </button>
                <button
                  onClick={() => setColorMode('contested')}
                  className="px-3 py-1.5 rounded-sm text-caption font-semibold transition-colors"
                  style={colorMode === 'contested' ? { background: 'var(--ink)', color: 'var(--paper)' } : { color: 'var(--ink-secondary)' }}
                >
                  Contested Races
                </button>
                <button
                  onClick={() => setColorMode('leadership')}
                  className="px-3 py-1.5 rounded-sm text-caption font-semibold transition-colors"
                  style={colorMode === 'leadership' ? { background: 'var(--ink)', color: 'var(--paper)' } : { color: 'var(--ink-secondary)' }}
                >
                  Committee Leadership
                </button>
                {historyYears.map((year) => (
                  <button
                    key={year}
                    onClick={() => setColorMode(`year:${year}`)}
                    className="px-3 py-1.5 rounded-sm text-caption font-semibold transition-colors"
                    style={colorMode === `year:${year}` ? { background: 'var(--ink)', color: 'var(--paper)' } : { color: 'var(--ink-secondary)' }}
                  >
                    {year} Result
                  </button>
                ))}
              </div>

              {colorMode === 'party' && (
                <div className="flex items-center gap-4 text-caption text-primary-500">
                  <LegendSwatch color={PARTY_FILL.R} label="Republican" />
                  <LegendSwatch color={PARTY_FILL.D} label="Democrat" />
                  <LegendSwatch color={NEUTRAL_FILL} label="No current data" />
                </div>
              )}
              {colorMode === 'score' && (
                <GradientLegend gradient={SCORE_GRADIENT_CSS} lowLabel="Low alignment" highLabel="High alignment" />
              )}
              {colorMode === 'funding' && (
                <GradientLegend
                  gradient={FUNDING_GRADIENT_CSS}
                  lowLabel="Lowest raised"
                  highLabel="Highest raised"
                  extra={{ color: NEUTRAL_FILL, label: 'No funding on file' }}
                />
              )}
              {colorMode === 'contested' && (
                <GradientLegend
                  gradient={CONTESTED_GRADIENT_CSS}
                  lowLabel="Uncontested"
                  highLabel="Most contested"
                  extra={{ color: NEUTRAL_FILL, label: 'No current data' }}
                />
              )}
              {colorMode === 'leadership' && (
                <div className="flex items-center gap-4 text-caption text-primary-500">
                  <LegendSwatch color={fillForLeadership('chair')} label="Chair" />
                  <LegendSwatch color={fillForLeadership('subcommittee-chair')} label="Subcommittee chair" />
                  <LegendSwatch color={fillForLeadership('officer')} label="Vice chair / secretary" />
                  <LegendSwatch color={fillForLeadership('member')} label="Member only" />
                </div>
              )}
              {colorMode.startsWith('year:') && (
                <div className="flex items-center gap-4 text-caption text-primary-500">
                  <LegendSwatch color={fillForMargin('R', 28)} label="Safe R" />
                  <LegendSwatch color={fillForMargin('R', 4)} label="Lean R" />
                  <LegendSwatch color={fillForMargin('D', 4)} label="Lean D" />
                  <LegendSwatch color={fillForMargin('D', 28)} label="Safe D" />
                </div>
              )}
            </div>

            {colorMode === 'funding' && (
              <p className="text-caption text-primary-400 mb-3">
                Source: campaign contributions tracked via{' '}
                <a
                  href="https://www.followthemoney.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary-700"
                >
                  FollowTheMoney.org
                </a>
                . See the Funding Intel tab for full detail per donor.
              </p>
            )}
            {colorMode === 'contested' && (
              <p className="text-caption text-primary-400 mb-3">
                &quot;Contested&quot; means 2 or more declared candidates are on file for that district in this
                tool — it does not by itself indicate a competitive race; check the historical lean toggle
                alongside it for that read.
              </p>
            )}
            {colorMode === 'leadership' && (
              <p className="text-caption text-primary-400 mb-3">
                Committee assignments and leadership roles, scraped from each incumbent&apos;s official{' '}
                <a href="https://www.palegis.us/house/members" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">
                  palegis.us
                </a>{' '}
                bio page. Challenger-only districts show no data until elected.
              </p>
            )}
            {colorMode.startsWith('year:') && electionHistory?.sources[colorMode.slice(5)] && (
              <p className="text-caption text-primary-400 mb-3">
                Source: precinct-level results aggregated from{' '}
                <a
                  href={electionHistory.sources[colorMode.slice(5)]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary-700"
                >
                  openelections-data-pa
                </a>{' '}
                . District lines for years before 2022 reflect the pre-redistricting map, so numbering may not
                match today&apos;s boundaries exactly.
              </p>
            )}

            <div className="card p-4">
              <PADistrictMap
                geojson={geojson}
                getFill={getFill}
                selectedDistrict={selectedDistrict}
                hoveredDistrict={hoveredDistrict}
                onSelect={setSelectedDistrict}
                onHover={setHoveredDistrict}
              />
              {hoveredDistrict && (
                <p className="text-caption text-primary-400 mt-2 text-center">
                  <span className="figure">HD-{hoveredDistrict}</span>{hoveredName ? ` · ${hoveredName}` : ''}
                  {hoveredLeadershipTier ? ` · ${LEADERSHIP_LABELS[hoveredLeadershipTier]}` : ''}
                </p>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div>
            {!selectedDistrict && (
              <div className="rounded-xl p-8 text-center" style={{ background: 'var(--card)', border: '1px dashed var(--rule-strong)' }}>
                <p className="text-body-sm text-primary-500">
                  Click any district on the map to see its current representative, Chamber alignment score, and funding data.
                </p>
              </div>
            )}

            {selectedDistrict && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-heading-4 text-primary-950">House District <span className="figure">{selectedDistrict}</span></h2>
                  <button
                    onClick={() => setSelectedDistrict(null)}
                    className="text-caption text-primary-400 hover:text-primary-700"
                  >
                    Clear
                  </button>
                </div>

                {selectedReps.length === 0 && (
                  <div className="card p-5 text-center">
                    <p className="text-body-sm text-primary-500">No current candidate data for this district yet.</p>
                  </div>
                )}

                <div className="space-y-4">
                  {selectedReps.map((rep) => (
                    <PoliticianCard key={rep.id} politician={rep} hasFunding={fundingSet.has(rep.id)} committeeRole={committeeRoleById[rep.id] ?? null} normalizedScore={normalizedScoresById[rep.id] ?? null} />
                  ))}
                </div>

                {selectedHistory && Object.keys(selectedHistory).length > 0 && (
                  <HistoryTrendBars history={selectedHistory} years={historyYears} />
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type SortKey = 'district' | 'name' | 'party' | 'score' | 'funding' | 'lean';

interface DistrictRow {
  district: string;
  county: string | null;
  reps: PoliticianWithScores[];
  primaryScore: number | null;
  funding: number;
  leanWinner: string | null;
  leanMarginPct: number | null;
}

function DistrictTable({
  politiciansByDistrict,
  fundingTotals,
  electionHistory,
  historyYears,
  committeeRoleById,
}: {
  readonly politiciansByDistrict: Record<string, PoliticianWithScores[]>;
  readonly fundingTotals: Record<string, number>;
  readonly electionHistory: ElectionHistoryFile | null;
  readonly historyYears: string[];
  readonly committeeRoleById?: Record<string, string>;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('district');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const mostRecentYear = historyYears[0];

  const rows = useMemo<DistrictRow[]>(() => {
    return Array.from({ length: TOTAL_DISTRICTS }, (_, i) => {
      const district = String(i + 1).padStart(3, '0');
      const reps = politiciansByDistrict[district] ?? [];
      const incumbent = reps.find((r) => getCandidacyStatus(r) === 'incumbent') ?? reps[0];
      const funding = reps.reduce((s, r) => s + (fundingTotals[r.id] ?? 0), 0);
      const history = mostRecentYear ? electionHistory?.districts[district]?.[mostRecentYear] : undefined;
      return {
        district,
        county: incumbent?.county ?? null,
        reps,
        primaryScore: incumbent?.overall_score?.overall_score ?? null,
        funding,
        leanWinner: history?.winner_party ?? null,
        leanMarginPct: history?.margin_pct ?? null,
      };
    });
  }, [politiciansByDistrict, fundingTotals, electionHistory, mostRecentYear]);

  const sorted = useMemo(() => {
    return rows.toSorted((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'district':
          cmp = Number(a.district) - Number(b.district);
          break;
        case 'name':
          cmp = (a.reps[0]?.full_name ?? '').localeCompare(b.reps[0]?.full_name ?? '');
          break;
        case 'party':
          cmp = (a.reps[0]?.party ?? '').localeCompare(b.reps[0]?.party ?? '');
          break;
        case 'score':
          cmp = (a.primaryScore ?? -1) - (b.primaryScore ?? -1);
          break;
        case 'funding':
          cmp = a.funding - b.funding;
          break;
        case 'lean': {
          const signed = (r: DistrictRow) => (r.leanWinner === 'R' ? 1 : r.leanWinner === 'D' ? -1 : 0) * (r.leanMarginPct ?? 0);
          cmp = signed(a) - signed(b);
          break;
        }
      }
      return cmp * sortDir;
    });
  }, [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === 'district' || key === 'name' || key === 'party' ? 1 : -1);
    }
  }

  function SortHeader({ sortKeyValue, label, align = 'left' }: { readonly sortKeyValue: SortKey; readonly label: string; readonly align?: 'left' | 'right' }) {
    const active = sortKey === sortKeyValue;
    return (
      <th
        className={`px-4 py-2.5 font-semibold text-primary-500 cursor-pointer select-none hover:text-primary-800 ${align === 'right' ? 'text-right' : 'text-left'}`}
        onClick={() => handleSort(sortKeyValue)}
      >
        {label} {active && (sortDir === 1 ? '▲' : '▼')}
      </th>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-caption border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--rule)', background: 'var(--well)' }}>
              <SortHeader sortKeyValue="district" label="District" />
              <SortHeader sortKeyValue="name" label="Representative(s)" />
              <SortHeader sortKeyValue="party" label="Party" />
              <SortHeader sortKeyValue="score" label="Chamber Score" align="right" />
              <SortHeader sortKeyValue="funding" label="Funding Raised" align="right" />
              <SortHeader sortKeyValue="lean" label={mostRecentYear ? `${mostRecentYear} Lean` : 'Historical Lean'} align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.district} style={{ borderBottom: '1px solid var(--rule)' }} className="hover:bg-primary-50 transition-colors">
                <td className="px-4 py-2.5 text-primary-900 font-medium whitespace-nowrap">
                  <span className="figure">HD-{row.district}</span>
                  {row.county && <span className="text-primary-400"> · {row.county} Co.</span>}
                </td>
                <td className="px-4 py-2.5">
                  {row.reps.length === 0 ? (
                    <span className="text-primary-400 italic">No data yet</span>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {row.reps.map((r) => (
                        <Link key={r.id} href={`/politicians/${r.id}`} className="flex items-center gap-1.5 hover:underline">
                          <span className="text-primary-900 font-medium">{r.full_name}</span>
                          <CandidacyBadge status={getCandidacyStatus(r)} />
                        </Link>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {row.reps[0] && <PartyBadge party={row.reps[0].party} />}
                </td>
                <td className="px-4 py-2.5 text-right figure text-primary-900">
                  {row.primaryScore !== null ? `${Math.round(rescaleScore(row.primaryScore) * 100)}%` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right figure text-primary-900">
                  {row.funding > 0 ? fmtMoney(row.funding) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {row.leanWinner && row.leanMarginPct !== null ? (
                    <span className="figure font-semibold" style={{ color: row.leanWinner === 'R' ? PARTY_FILL.R : PARTY_FILL.D }}>
                      {row.leanWinner} +{row.leanMarginPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-primary-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryTrendBars({
  history,
  years,
}: {
  readonly history: Record<string, ElectionYearResult>;
  readonly years: string[];
}) {
  return (
    <div className="card mt-4 p-4">
      <p className="text-caption font-semibold text-primary-700 mb-3">Historical general election results</p>
      <div className="space-y-2.5">
        {years.map((year) => {
          const r = history[year];
          if (!r || r.total_votes === 0) return null;
          const demPct = (r.dem_votes / r.total_votes) * 100;
          const repPct = (r.rep_votes / r.total_votes) * 100;
          return (
            <div key={year}>
              <div className="flex items-center justify-between text-caption text-primary-500 mb-0.5">
                <span className="figure font-medium">{year}</span>
                <span className="figure">
                  D {Math.round(demPct)}% · R {Math.round(repPct)}%
                </span>
              </div>
              <div className="flex h-2.5 rounded-sm overflow-hidden" style={{ background: 'var(--well)' }}>
                <div style={{ width: `${demPct}%`, background: PARTY_FILL.D }} />
                <div style={{ width: `${repPct}%`, background: PARTY_FILL.R }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendSwatch({ color, label }: { readonly color: string; readonly label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color, border: '1px solid var(--rule-soft)' }} />
      {label}
    </span>
  );
}

function GradientLegend({
  gradient,
  lowLabel,
  highLabel,
  extra,
}: {
  readonly gradient: string;
  readonly lowLabel: string;
  readonly highLabel: string;
  readonly extra?: { color: string; label: string };
}) {
  return (
    <div className="flex items-center gap-4 text-caption text-primary-500">
      <div className="flex items-center gap-2">
        <span>{lowLabel}</span>
        <span className="inline-block w-24 h-3 rounded-sm" style={{ background: gradient, border: '1px solid var(--rule-soft)' }} />
        <span>{highLabel}</span>
      </div>
      {extra && <LegendSwatch color={extra.color} label={extra.label} />}
    </div>
  );
}
