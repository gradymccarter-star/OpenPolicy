'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ComparisonRadar } from '@/components/scores/RadarChart';
import ScoreGauge from '@/components/scores/ScoreGauge';
import { PartyBadge } from '@/components/ui/Badge';
import { PA_CHAMBER_PRINCIPLES, PARTY_COLORS } from '@/lib/utils/constants';
import { formatScore, getScoreColor } from '@/lib/utils/helpers';
import type { PoliticianWithScores } from '@/lib/utils/types';

function partyLabel(party: string): string {
  if (party === 'D') return 'Democrat';
  if (party === 'R') return 'Republican';
  return 'Independent';
}

const PA_COUNTIES = [
  'Adams','Allegheny','Armstrong','Beaver','Bedford','Berks','Blair','Bradford',
  'Bucks','Butler','Cambria','Cameron','Carbon','Centre','Chester','Clarion',
  'Clearfield','Clinton','Columbia','Crawford','Cumberland','Dauphin','Delaware',
  'Elk','Erie','Fayette','Forest','Franklin','Fulton','Greene','Huntingdon',
  'Indiana','Jefferson','Juniata','Lackawanna','Lancaster','Lawrence','Lebanon',
  'Lehigh','Luzerne','Lycoming','McKean','Mercer','Mifflin','Monroe','Montgomery',
  'Montour','Northampton','Northumberland','Perry','Philadelphia','Pike','Potter',
  'Schuylkill','Snyder','Somerset','Sullivan','Susquehanna','Tioga','Union',
  'Venango','Warren','Washington','Wayne','Westmoreland','Wyoming','York',
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

  const candidateA = allPoliticians.find(p => p.id === selectedA);
  const candidateB = allPoliticians.find(p => p.id === selectedB);

  function handleCompare() {
    if (selectedA && selectedB) {
      router.push(`/compare?a=${selectedA}&b=${selectedB}`);
    }
  }

  function getRadarData(politician: PoliticianWithScores) {
    const os = politician.overall_score as any;
    return Object.entries(PA_CHAMBER_PRINCIPLES).map(([key]) => ({
      label: key,
      value: os?.[`${key.toLowerCase()}_score`] ?? 0,
    }));
  }

  const principleKeys = Object.keys(PA_CHAMBER_PRINCIPLES);

  return (
    <>
      {/* Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <CandidateSelector
          label="Candidate 1"
          politicians={allPoliticians}
          selected={selectedA}
          onSelect={setSelectedA}
          excludeId={selectedB}
        />

        <CandidateSelector
          label="Candidate 2"
          politicians={allPoliticians}
          selected={selectedB}
          onSelect={setSelectedB}
          excludeId={selectedA}
        />
      </div>

      {/* Compare Button */}
      {selectedA && selectedB && !candidateA && !candidateB && (
        <div className="flex justify-center mb-8">
          <button onClick={handleCompare} className="btn-primary">
            Compare Now
          </button>
        </div>
      )}

      {/* Results */}
      {candidateA && candidateB && (
        <>
          {/* Overlaid Radar Chart */}
          <div className="rounded-2xl p-8 mb-8" style={{ background: '#07111f', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h2 className="text-lg font-bold text-white mb-6 text-center tracking-tight">
              Principle Profile Comparison
            </h2>
            <div className="flex justify-center">
              <ComparisonRadar
                size={340}
                datasets={[
                  {
                    scores: getRadarData(candidateA),
                    color: PARTY_COLORS[candidateA.party] || '#0a0e1a',
                    name: candidateA.full_name,
                  },
                  {
                    scores: getRadarData(candidateB),
                    color: PARTY_COLORS[candidateB.party] || '#9ca3af',
                    name: candidateB.full_name,
                  },
                ]}
              />
            </div>
          </div>

          {/* Side-by-Side Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <CandidateSummaryCard politician={candidateA} accentColor={PARTY_COLORS[candidateA.party] || '#c9a84c'} />
            <CandidateSummaryCard politician={candidateB} accentColor={PARTY_COLORS[candidateB.party] || '#9ca3af'} />
          </div>

          {/* Principle-by-Principle Comparison */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
            <div className="px-8 py-5 flex items-center justify-between flex-wrap gap-3" style={{ background: '#0a1628' }}>
              <h2 className="text-base font-bold text-white">Principle-by-Principle Breakdown</h2>
              <p className="text-caption" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Scores = % alignment with PA Chamber priorities (0% opposed · 100% fully aligned)
              </p>
            </div>
            <div className="overflow-x-auto bg-white">
              <table className="w-full text-body-sm">
                <thead>
                  <tr style={{ background: '#f8f7f5', borderBottom: '1px solid #e5e7eb' }}>
                    <th className="text-left py-3 px-6 font-semibold text-primary-950">Principle</th>
                    <th className="text-center py-3 px-4 font-semibold text-primary-950">{candidateA.last_name}</th>
                    <th className="text-center py-3 px-4 font-semibold text-primary-950">{candidateB.last_name}</th>
                    <th className="text-center py-3 px-6 font-semibold text-primary-950">Leader</th>
                  </tr>
                </thead>
                <tbody>
                  {principleKeys.map((key, idx) => {
                    const os = PA_CHAMBER_PRINCIPLES[key];
                    const scoreA = (candidateA.overall_score as any)?.[`${key.toLowerCase()}_score`] ?? 0;
                    const scoreB = (candidateB.overall_score as any)?.[`${key.toLowerCase()}_score`] ?? 0;
                    const diff = scoreA - scoreB;
                    const absDiff = Math.abs(Math.round(diff * 100));
                    const tied = absDiff < 2;
                    const leaderName = diff > 0 ? candidateA.last_name : candidateB.last_name;
                    const leaderColor = diff > 0 ? '#16a34a' : '#dc2626';

                    return (
                      <tr key={key} style={{ borderBottom: '1px solid #f3f4f6', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td className="py-3 px-6">
                          <span className="text-caption font-bold px-1.5 py-0.5 rounded mr-1.5" style={{ background: '#0a1628', color: '#c9a84c' }}>{key}</span>
                          <span className="text-primary-500 text-caption">{os.name}</span>
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
                        <td className="text-center py-3 px-6">
                          {tied ? (
                            <span className="text-caption font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(107,114,128,0.1)', color: '#6b7280' }}>
                              Tied
                            </span>
                          ) : (
                            <span className="text-caption font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${leaderColor}18`, color: leaderColor }}>
                              {leaderName} +{absDiff}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '2px solid #e5e7eb', background: '#f8f7f5' }}>
                    <td className="py-4 px-6 font-bold text-primary-950">Overall Score</td>
                    <td className="text-center py-4 px-4">
                      <span className="font-bold text-lg" style={{ color: getScoreColor(candidateA.overall_score?.overall_score ?? 0) }}>
                        {formatScore(candidateA.overall_score?.overall_score ?? 0)}
                      </span>
                    </td>
                    <td className="text-center py-4 px-4">
                      <span className="font-bold text-lg" style={{ color: getScoreColor(candidateB.overall_score?.overall_score ?? 0) }}>
                        {formatScore(candidateB.overall_score?.overall_score ?? 0)}
                      </span>
                    </td>
                    <td className="text-center py-4 px-6">
                      {(() => {
                        const d = (candidateA.overall_score?.overall_score ?? 0) - (candidateB.overall_score?.overall_score ?? 0);
                        const abd = Math.abs(Math.round(d * 100));
                        if (abd < 2) return (
                          <span className="font-bold text-base px-2 py-0.5 rounded-full" style={{ background: 'rgba(107,114,128,0.12)', color: '#6b7280' }}>Tied</span>
                        );
                        const name = d > 0 ? candidateA.last_name : candidateB.last_name;
                        const col = d > 0 ? '#16a34a' : '#dc2626';
                        return (
                          <span className="font-bold text-base px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: `${col}18`, color: col }}>
                            {name} +{abd}%
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

function CandidateSelector({
  label,
  politicians,
  selected,
  onSelect,
  excludeId,
}: {
  readonly label: string;
  readonly politicians: PoliticianWithScores[];
  readonly selected: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly excludeId: string | null;
}) {
  const [partyFilter, setPartyFilter] = useState<string>('all');
  const [countyFilter, setCountyFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return politicians.filter(p => {
      if (p.id === excludeId) return false;
      if (partyFilter !== 'all' && p.party !== partyFilter) return false;
      if (countyFilter !== 'all' && p.county !== countyFilter) return false;
      if (search && !p.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [politicians, excludeId, partyFilter, countyFilter, search]);

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
          <label className="block text-caption font-medium text-primary-400 mb-1">County</label>
          <select
            value={countyFilter}
            onChange={(e) => setCountyFilter(e.target.value)}
            className="w-full px-2.5 py-2 text-caption rounded-lg transition-colors"
            style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}
          >
            <option value="all">All Counties</option>
            {PA_COUNTIES.map(c => (
              <option key={c} value={c}>{c}</option>
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
              {selectedPolitician.county && (
                <span className="text-caption text-primary-400">{selectedPolitician.county} Co.</span>
              )}
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
                <p className="text-caption text-primary-400">
                  {partyLabel(p.party)}{p.county && ` · ${p.county} Co.`}
                </p>
              </div>
              <span className="text-body-sm font-bold" style={{ color: getScoreColor(p.overall_score?.overall_score ?? 0) }}>
                {formatScore(p.overall_score?.overall_score ?? 0)}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-primary-400 text-caption py-6">
              No candidates match your filters
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CandidateSummaryCard({ politician, accentColor }: { readonly politician: PoliticianWithScores; readonly accentColor: string }) {
  const os = politician.overall_score;

  return (
    <div className="rounded-2xl p-6 bg-white" style={{ border: '1px solid #e5e7eb', borderTop: `4px solid ${accentColor}` }}>
      <div className="flex items-center space-x-4 mb-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-base"
          style={{ background: accentColor, color: '#fff', filter: 'brightness(0.85)' }}
        >
          {politician.first_name[0]}{politician.last_name[0]}
        </div>
        <div>
          <h3 className="font-bold text-primary-950">{politician.full_name}</h3>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <PartyBadge party={politician.party} />
            {politician.county && (
              <span className="text-caption text-primary-400">{politician.county} Co.</span>
            )}
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
