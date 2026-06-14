'use client';

import { useState, useMemo } from 'react';
import PoliticianCard from './PoliticianCard';
import type { PoliticianWithScores } from '@/lib/utils/types';

interface PoliticiansClientProps {
  readonly politicians: PoliticianWithScores[];
  readonly showExamples: boolean;
  readonly initialQuery?: string;
}

export default function PoliticiansClient({ politicians, showExamples, initialQuery = '' }: PoliticiansClientProps) {
  const [search, setSearch] = useState(initialQuery);
  const [party, setParty] = useState<string>('all');
  const [minScore, setMinScore] = useState(0);
  const [sort, setSort] = useState<'score' | 'name'>('score');

  const filtered = useMemo(() => {
    const results = politicians.filter((p) => {
      const q = search.toLowerCase();
      if (q && !p.full_name.toLowerCase().includes(q) && !p.district?.toString().includes(q)) return false;
      if (party !== 'all' && p.party !== party) return false;
      const score = (p.overall_score?.overall_score ?? 0) * 100;
      if (score < minScore) return false;
      return true;
    });

    return results.toSorted((a, b) => {
      if (sort === 'name') return a.full_name.localeCompare(b.full_name);
      return (b.overall_score?.overall_score ?? 0) - (a.overall_score?.overall_score ?? 0);
    });
  }, [politicians, search, party, minScore, sort]);

  const hasFilters = party !== 'all' || minScore > 0 || search !== '';

  return (
    <div>
      {/* Search header */}
      <div className="mb-6 p-6 rounded-2xl" style={{ background: '#0a1628' }}>
        <p className="text-caption font-semibold uppercase tracking-widest mb-3" style={{ color: '#c9a84c' }}>
          Search 2026 PA House Members
        </p>
        <div className="relative mb-4">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name or district number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
            className="w-full pl-12 pr-4 py-4 rounded-xl text-base font-medium text-white placeholder-white/30 outline-none focus:ring-2"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Party */}
          <div className="flex gap-1">
            {[{ value: 'all', label: 'All Parties' }, { value: 'R', label: 'Republican' }, { value: 'D', label: 'Democrat' }].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setParty(opt.value)}
                className="px-3 py-1.5 rounded-lg text-caption font-semibold transition-all"
                style={party === opt.value
                  ? { background: '#c9a84c', color: '#0a1628' }
                  : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Min alignment */}
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg text-caption font-semibold outline-none"
            style={{ background: 'rgba(255,255,255,0.08)', color: minScore > 0 ? '#c9a84c' : 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <option value={0}>Any Alignment</option>
            <option value={55}>55%+ Alignment</option>
            <option value={60}>60%+ Alignment</option>
            <option value={65}>65%+ Alignment</option>
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as 'score' | 'name')}
            className="px-3 py-1.5 rounded-lg text-caption font-semibold outline-none"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            <option value="score">Sort: Top Score</option>
            <option value="name">Sort: A–Z</option>
          </select>

          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setParty('all'); setMinScore(0); }}
              className="px-3 py-1.5 rounded-lg text-caption font-semibold transition-all"
              style={{ color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Clear
            </button>
          )}

          <span className="ml-auto text-caption font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {filtered.length} of {politicians.length} members
          </span>
        </div>
      </div>

      {/* Results grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((politician) => (
            <PoliticianCard key={politician.id} politician={politician} />
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-heading-3 text-primary-950 mb-2">No members found</p>
          <p className="text-body-sm text-primary-400">Try adjusting your search or filters.</p>
        </div>
      )}

      {showExamples && (
        <p className="text-center text-caption text-primary-400 mt-8">
          Example data shown. Run the evaluation pipeline to see real scores.
        </p>
      )}
    </div>
  );
}
