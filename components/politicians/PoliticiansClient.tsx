'use client';

import { useState, useMemo } from 'react';
import PoliticianCard from './PoliticianCard';
import type { PoliticianWithScores } from '@/lib/utils/types';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

interface PoliticiansClientProps {
  politicians: PoliticianWithScores[];
  showExamples: boolean;
}

export default function PoliticiansClient({ politicians, showExamples }: PoliticiansClientProps) {
  const [search, setSearch] = useState('');
  const [party, setParty] = useState<string>('all');
  const [state, setState] = useState<string>('all');
  const [scoreRange, setScoreRange] = useState<[number, number]>([0, 100]);
  const [confidenceRange, setConfidenceRange] = useState<[number, number]>([0, 100]);

  const filtered = useMemo(() => {
    return politicians.filter((p) => {
      // Search
      if (search && !p.full_name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      // Party
      if (party !== 'all' && p.party !== party) {
        return false;
      }
      // State
      if (state !== 'all' && p.state !== state) {
        return false;
      }
      // Score
      const score = (p.overall_score?.overall_score ?? 0) * 100;
      if (score < scoreRange[0] || score > scoreRange[1]) {
        return false;
      }
      // Confidence
      const confidence = (p.overall_score?.overall_confidence ?? 0) * 100;
      if (confidence < confidenceRange[0] || confidence > confidenceRange[1]) {
        return false;
      }
      return true;
    });
  }, [politicians, search, party, state, scoreRange, confidenceRange]);

  const hasActiveFilters = party !== 'all' || state !== 'all' || scoreRange[0] > 0 || scoreRange[1] < 100 || confidenceRange[0] > 0 || confidenceRange[1] < 100 || search !== '';

  return (
    <div>
      {/* Filters */}
      <div className="card p-4 mb-6 space-y-4">
        {/* Search */}
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-body-sm"
          style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Party */}
          <div>
            <label className="text-caption font-medium text-primary-500 mb-1 block">Party</label>
            <div className="flex gap-1">
              {[
                { value: 'all', label: 'All' },
                { value: 'D', label: 'D' },
                { value: 'R', label: 'R' },
                { value: 'I', label: 'I' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setParty(opt.value)}
                  className={`px-3 py-1.5 rounded-md text-caption font-medium transition-colors ${
                    party === opt.value
                      ? 'bg-primary-950 text-white'
                      : 'text-primary-500 hover:bg-primary-50'
                  }`}
                  style={party !== opt.value ? { border: '1px solid var(--border)' } : undefined}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* State */}
          <div>
            <label className="text-caption font-medium text-primary-500 mb-1 block">State</label>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full px-3 py-1.5 rounded-md text-caption"
              style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}
            >
              <option value="all">All States</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Alignment Score */}
          <div>
            <label className="text-caption font-medium text-primary-500 mb-1 block">
              Alignment: {scoreRange[0]}% – {scoreRange[1]}%
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={scoreRange[0]}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setScoreRange([Math.min(val, scoreRange[1]), scoreRange[1]]);
                }}
                className="w-full accent-primary-950"
              />
              <input
                type="range"
                min={0}
                max={100}
                value={scoreRange[1]}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setScoreRange([scoreRange[0], Math.max(val, scoreRange[0])]);
                }}
                className="w-full accent-primary-950"
              />
            </div>
          </div>

          {/* Confidence */}
          <div>
            <label className="text-caption font-medium text-primary-500 mb-1 block">
              Confidence: {confidenceRange[0]}% – {confidenceRange[1]}%
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={confidenceRange[0]}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setConfidenceRange([Math.min(val, confidenceRange[1]), confidenceRange[1]]);
                }}
                className="w-full accent-primary-950"
              />
              <input
                type="range"
                min={0}
                max={100}
                value={confidenceRange[1]}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setConfidenceRange([confidenceRange[0], Math.max(val, confidenceRange[0])]);
                }}
                className="w-full accent-primary-950"
              />
            </div>
          </div>
        </div>

        {/* Active filter count + clear */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-caption text-primary-400">
              {filtered.length} of {politicians.length} senators shown
            </p>
            <button
              onClick={() => {
                setSearch('');
                setParty('all');
                setState('all');
                setScoreRange([0, 100]);
                setConfidenceRange([0, 100]);
              }}
              className="text-caption font-medium text-primary-500 hover:text-primary-950 transition-colors"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((politician) => (
          <PoliticianCard key={politician.id} politician={politician} />
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-body-sm text-primary-400 py-12">
          No senators match your filters.
        </p>
      )}

      {showExamples && (
        <p className="text-center text-caption text-primary-400 mt-8">
          Example data shown. Run the evaluation pipeline to see real scores.
        </p>
      )}
    </div>
  );
}
