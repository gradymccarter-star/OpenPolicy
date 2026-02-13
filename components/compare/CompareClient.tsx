'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ComparisonRadar } from '@/components/scores/RadarChart';
import ScoreGauge from '@/components/scores/ScoreGauge';
import { PartyBadge, StateBadge } from '@/components/ui/Badge';
import { OECD_PRINCIPLES, PARTY_COLORS } from '@/lib/utils/constants';
import { formatScore, getScoreColor } from '@/lib/utils/helpers';
import type { PoliticianWithScores } from '@/lib/utils/types';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

interface CompareClientProps {
  allPoliticians: PoliticianWithScores[];
  initialA?: string;
  initialB?: string;
}

export default function CompareClient({ allPoliticians, initialA, initialB }: CompareClientProps) {
  const router = useRouter();
  const [selectedA, setSelectedA] = useState<string | null>(initialA || null);
  const [selectedB, setSelectedB] = useState<string | null>(initialB || null);

  const senatorA = allPoliticians.find(p => p.id === selectedA);
  const senatorB = allPoliticians.find(p => p.id === selectedB);

  function handleCompare() {
    if (selectedA && selectedB) {
      router.push(`/compare?a=${selectedA}&b=${selectedB}`);
    }
  }

  function getRadarData(politician: PoliticianWithScores) {
    const os = politician.overall_score;
    return Object.entries(OECD_PRINCIPLES).map(([key]) => ({
      label: key,
      value: os?.[`${key.toLowerCase()}_score` as keyof typeof os] as number ?? 0,
    }));
  }

  const principleKeys = Object.keys(OECD_PRINCIPLES);

  return (
    <>
      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <PoliticianSelector
          label="Politician 1"
          politicians={allPoliticians}
          selected={selectedA}
          onSelect={setSelectedA}
          excludeId={selectedB}
        />

        <PoliticianSelector
          label="Politician 2"
          politicians={allPoliticians}
          selected={selectedB}
          onSelect={setSelectedB}
          excludeId={selectedA}
        />
      </div>

      {/* Compare Button */}
      {selectedA && selectedB && !senatorA && !senatorB && (
        <div className="flex justify-center mb-8">
          <button
            onClick={handleCompare}
            className="btn-primary"
          >
            Compare Now
          </button>
        </div>
      )}

      {/* Results */}
      {senatorA && senatorB && (
        <>
          {/* Overlaid Radar Chart */}
          <div className="card p-8 mb-8">
            <h2 className="text-heading-3 mb-6 text-center">
              Principle Profile Comparison
            </h2>
            <div className="flex justify-center">
              <ComparisonRadar
                size={340}
                datasets={[
                  {
                    scores: getRadarData(senatorA),
                    color: PARTY_COLORS[senatorA.party] || '#0a0e1a',
                    name: senatorA.full_name,
                  },
                  {
                    scores: getRadarData(senatorB),
                    color: PARTY_COLORS[senatorB.party] || '#9ca3af',
                    name: senatorB.full_name,
                  },
                ]}
              />
            </div>
          </div>

          {/* Side-by-Side Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <SenatorSummaryCard politician={senatorA} />
            <SenatorSummaryCard politician={senatorB} />
          </div>

          {/* Principle-by-Principle Comparison */}
          <div className="card p-8">
            <h2 className="text-heading-3 mb-6">
              Principle-by-Principle Breakdown
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left py-3 pr-4 font-semibold text-primary-950">Principle</th>
                    <th className="text-center py-3 px-4 font-semibold text-primary-950">{senatorA.full_name}</th>
                    <th className="text-center py-3 px-4 font-semibold text-primary-950">{senatorB.full_name}</th>
                    <th className="text-center py-3 pl-4 font-semibold text-primary-950">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {principleKeys.map((key) => {
                    const scoreA = (senatorA.overall_score as any)?.[`${key.toLowerCase()}_score`] ?? 0;
                    const scoreB = (senatorB.overall_score as any)?.[`${key.toLowerCase()}_score`] ?? 0;
                    const diff = scoreA - scoreB;
                    const principle = OECD_PRINCIPLES[key];

                    return (
                      <tr key={key} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td className="py-3 pr-4">
                          <span className="font-medium text-primary-950">{key}:</span>{' '}
                          <span className="text-primary-500">{principle.name}</span>
                        </td>
                        <td className="text-center py-3 px-4">
                          <span className="font-bold" style={{ color: getScoreColor(scoreA) }}>
                            {formatScore(scoreA)}
                          </span>
                        </td>
                        <td className="text-center py-3 px-4">
                          <span className="font-bold" style={{ color: getScoreColor(scoreB) }}>
                            {formatScore(scoreB)}
                          </span>
                        </td>
                        <td className="text-center py-3 pl-4">
                          <span className={`font-bold ${diff > 0 ? 'text-primary-950' : diff < 0 ? 'text-primary-400' : 'text-primary-400'}`}>
                            {diff > 0 ? '+' : ''}{Math.round(diff * 100)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid var(--faint)' }}>
                    <td className="py-3 pr-4 font-bold text-primary-950">Overall</td>
                    <td className="text-center py-3 px-4">
                      <span className="font-bold text-lg" style={{ color: getScoreColor(senatorA.overall_score?.overall_score ?? 0) }}>
                        {formatScore(senatorA.overall_score?.overall_score ?? 0)}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className="font-bold text-lg" style={{ color: getScoreColor(senatorB.overall_score?.overall_score ?? 0) }}>
                        {formatScore(senatorB.overall_score?.overall_score ?? 0)}
                      </span>
                    </td>
                    <td className="text-center py-3 pl-4">
                      {(() => {
                        const d = (senatorA.overall_score?.overall_score ?? 0) - (senatorB.overall_score?.overall_score ?? 0);
                        return (
                          <span className={`font-bold text-lg ${d > 0 ? 'text-primary-950' : d < 0 ? 'text-primary-400' : 'text-primary-400'}`}>
                            {d > 0 ? '+' : ''}{Math.round(d * 100)}%
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function PoliticianSelector({
  label,
  politicians,
  selected,
  onSelect,
  excludeId,
}: {
  label: string;
  politicians: PoliticianWithScores[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  excludeId: string | null;
}) {
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return politicians.filter(p => {
      if (p.id === excludeId) return false;
      if (partyFilter !== 'all' && p.party !== partyFilter) return false;
      if (stateFilter !== 'all' && p.state !== stateFilter) return false;
      if (search && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [politicians, excludeId, partyFilter, stateFilter, search]);

  const selectedPolitician = politicians.find(p => p.id === selected);

  return (
    <div className="card p-6">
      <h3 className="text-body-sm font-semibold text-primary-950 mb-4">{label}</h3>

      {/* Filters */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-caption font-medium text-primary-400 mb-1">Party</label>
          <select
            value={partyFilter}
            onChange={(e) => setPartyFilter(e.target.value)}
            className="w-full px-2.5 py-2 text-caption rounded-lg transition-colors"
            style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}
          >
            <option value="all">All</option>
            <option value="D">Democrat</option>
            <option value="R">Republican</option>
            <option value="I">Independent</option>
          </select>
        </div>
        <div>
          <label className="block text-caption font-medium text-primary-400 mb-1">State</label>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="w-full px-2.5 py-2 text-caption rounded-lg transition-colors"
            style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}
          >
            <option value="all">All States</option>
            {US_STATES.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-caption font-medium text-primary-400 mb-1">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name..."
            className="w-full px-2.5 py-2 text-caption rounded-lg transition-colors"
            style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}
          />
        </div>
      </div>

      {/* Selected or List */}
      {selectedPolitician ? (
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-caption text-primary-950" style={{ border: '1px solid var(--border)' }}>
            {selectedPolitician.first_name[0]}{selectedPolitician.last_name[0]}
          </div>
          <div className="flex-1">
            <p className="font-medium text-body-sm text-primary-950">{selectedPolitician.full_name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <PartyBadge party={selectedPolitician.party} />
              <StateBadge state={selectedPolitician.state} />
            </div>
          </div>
          <div className="text-lg font-bold" style={{ color: getScoreColor(selectedPolitician.overall_score?.overall_score ?? 0) }}>
            {formatScore(selectedPolitician.overall_score?.overall_score ?? 0)}
          </div>
          <button
            onClick={() => onSelect(null)}
            className="text-primary-400 hover:text-primary-950 transition-colors p-1"
            aria-label="Clear selection"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {filtered.slice(0, 20).map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors hover:bg-primary-50"
              style={{ border: '1px solid transparent' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-caption text-primary-950" style={{ background: 'var(--surface-canvas)' }}>
                {p.first_name[0]}{p.last_name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-body-sm text-primary-950 truncate">{p.full_name}</p>
                <p className="text-caption text-primary-400">{p.party === 'D' ? 'Democrat' : p.party === 'R' ? 'Republican' : 'Independent'} &middot; {p.state}</p>
              </div>
              <span className="text-body-sm font-bold" style={{ color: getScoreColor(p.overall_score?.overall_score ?? 0) }}>
                {formatScore(p.overall_score?.overall_score ?? 0)}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-primary-400 text-caption py-6">
              No politicians match your filters
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SenatorSummaryCard({ politician }: { politician: PoliticianWithScores }) {
  const os = politician.overall_score;

  return (
    <div className="card p-6">
      <div className="flex items-center space-x-4 mb-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-primary-950" style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}>
          {politician.first_name[0]}{politician.last_name[0]}
        </div>
        <div>
          <h3 className="font-bold text-primary-950">{politician.full_name}</h3>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <PartyBadge party={politician.party} />
            <StateBadge state={politician.state} />
          </div>
        </div>
        <div className="ml-auto">
          <ScoreGauge
            score={os?.overall_score ?? 0}
            confidence={os?.overall_confidence ?? 0}
            size="small"
          />
        </div>
      </div>
      <div className="text-caption text-primary-400">
        {os?.total_evidence_items ?? 0} evidence items analyzed
      </div>
    </div>
  );
}
