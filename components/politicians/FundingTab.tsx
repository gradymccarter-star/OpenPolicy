'use client';

import { useState } from 'react';

type Lean = 'pro_chamber' | 'anti_chamber' | 'neutral' | 'unknown';

export interface Contribution {
  id: string;
  donor_name: string;
  donor_type: 'individual' | 'organization' | 'pac' | 'party' | 'other';
  amount: number;
  contribution_date: string | null;
  cycle_year: number;
  donor_org_id: string | null;
  donor_organizations: {
    lean: Lean;
    industry: string | null;
  } | null;
}

interface Props {
  contributions: Contribution[];
}

const LEAN_CONFIG: Record<Lean, { label: string; color: string; bg: string }> = {
  pro_chamber:  { label: 'Pro-Chamber',  color: '#166534', bg: '#dcfce7' },
  anti_chamber: { label: 'Anti-Chamber', color: '#991b1b', bg: '#fee2e2' },
  neutral:      { label: 'Neutral',      color: '#374151', bg: '#f3f4f6' },
  unknown:      { label: 'Unknown',      color: '#6b7280', bg: '#f9fafb' },
};

const CYCLES = [2026, 2024, 2022, 2020];

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function LeanBadge({ lean }: { lean: Lean }) {
  const cfg = LEAN_CONFIG[lean] ?? LEAN_CONFIG.unknown;
  return (
    <span
      className="inline-block text-caption font-semibold rounded px-2 py-0.5"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

function CycleTable({ rows, type }: { rows: Contribution[]; type: 'org' | 'individual' }) {
  const filtered = rows.filter(r =>
    type === 'org'
      ? r.donor_type !== 'individual'
      : r.donor_type === 'individual'
  );

  if (filtered.length === 0) {
    return <p className="text-caption text-primary-400 py-4">No {type === 'org' ? 'organizational' : 'individual'} contributions recorded.</p>;
  }

  return (
    <table className="w-full text-caption border-collapse">
      <thead>
        <tr style={{ borderBottom: '1px solid var(--border)' }}>
          <th className="text-left py-2 pr-4 font-semibold text-primary-500">Donor</th>
          {type === 'org' && <th className="text-left py-2 pr-4 font-semibold text-primary-500">Lean</th>}
          <th className="text-right py-2 font-semibold text-primary-500">Amount</th>
          <th className="text-right py-2 pl-4 font-semibold text-primary-500">Date</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(r => {
          const lean = r.donor_organizations?.lean ?? 'unknown';
          return (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50">
              <td className="py-2 pr-4 text-primary-900 font-medium">{r.donor_name}</td>
              {type === 'org' && (
                <td className="py-2 pr-4">
                  <LeanBadge lean={lean} />
                </td>
              )}
              <td className="py-2 text-right font-mono text-primary-900">{fmt(r.amount)}</td>
              <td className="py-2 pl-4 text-right text-primary-400">
                {r.contribution_date
                  ? new Date(r.contribution_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : `${r.cycle_year}`
                }
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function FundingTab({ contributions }: Props) {
  const [activeCycle, setActiveCycle] = useState<number>(
    // Default to the most recent cycle that has data
    CYCLES.find(y => contributions.some(c => c.cycle_year === y)) ?? CYCLES[0]
  );

  if (contributions.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-primary-400 text-body-sm">No campaign finance data available.</p>
        <p className="text-caption text-primary-400 mt-2">
          Run <code className="bg-stone-100 px-1 rounded">scripts/jobs/fetch-campaign-finance.js</code> to populate.
        </p>
      </div>
    );
  }

  const byLean = (lean: Lean) =>
    contributions.filter(c => c.cycle_year === activeCycle && c.donor_type !== 'individual' && c.donor_organizations?.lean === lean);

  const cycleTotals = CYCLES.map(y => ({
    year: y,
    total: contributions.filter(c => c.cycle_year === y).reduce((s, c) => s + c.amount, 0),
    count: contributions.filter(c => c.cycle_year === y).length,
    hasData: contributions.some(c => c.cycle_year === y),
  }));

  const cycleRows = contributions.filter(c => c.cycle_year === activeCycle);
  const orgTotal = cycleRows.filter(r => r.donor_type !== 'individual').reduce((s, c) => s + c.amount, 0);
  const indTotal = cycleRows.filter(r => r.donor_type === 'individual').reduce((s, c) => s + c.amount, 0);
  const proCount = byLean('pro_chamber').length;
  const antiCount = byLean('anti_chamber').length;

  return (
    <div className="space-y-6">
      {/* Cycle totals overview */}
      <div className="card p-6">
        <h3 className="text-heading-3 mb-4">Fundraising by Cycle</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cycleTotals.map(({ year, total, count, hasData }) => (
            <button
              key={year}
              onClick={() => setActiveCycle(year)}
              className="text-left rounded-xl p-4 transition-all"
              style={{
                border: `2px solid ${activeCycle === year ? '#c9a84c' : 'var(--border)'}`,
                background: activeCycle === year ? '#fdf8ee' : 'var(--surface-card)',
                opacity: hasData ? 1 : 0.4,
                cursor: hasData ? 'pointer' : 'default',
              }}
            >
              <div className="text-caption font-semibold text-primary-400 mb-1">{year}</div>
              <div className="text-body-sm font-bold text-primary-950">{hasData ? fmt(total) : '—'}</div>
              {hasData && <div className="text-caption text-primary-400">{count} donor{count !== 1 ? 's' : ''}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Cycle detail */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-heading-3">{activeCycle} Contributions</h3>
          <div className="flex gap-4 text-caption text-primary-400">
            <span>
              <span className="font-semibold text-primary-950">{proCount}</span> Pro-Chamber org{proCount !== 1 ? 's' : ''}
            </span>
            <span>
              <span className="font-semibold text-primary-950">{antiCount}</span> Anti-Chamber org{antiCount !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Org sub-total + table */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h4 className="font-semibold text-primary-950 text-body-sm">Organizations &amp; PACs</h4>
            <span className="text-caption text-primary-400">{fmt(orgTotal)}</span>
          </div>
          <CycleTable rows={cycleRows} type="org" />
        </div>

        {/* Individual sub-total + table */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h4 className="font-semibold text-primary-950 text-body-sm">Individuals $1,000+</h4>
            <span className="text-caption text-primary-400">{fmt(indTotal)}</span>
          </div>
          <CycleTable rows={cycleRows} type="individual" />
        </div>
      </div>
    </div>
  );
}
