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

const LEAN_CONFIG: Record<Lean, { label: string; color: string; bg: string; bar: string }> = {
  pro_chamber:  { label: 'Pro-Chamber',  color: '#166534', bg: '#dcfce7', bar: '#16a34a' },
  anti_chamber: { label: 'Anti-Chamber', color: '#991b1b', bg: '#fee2e2', bar: '#dc2626' },
  neutral:      { label: 'Neutral',      color: '#374151', bg: '#f3f4f6', bar: '#6b7280' },
  unknown:      { label: 'Unknown',      color: '#6b7280', bg: '#f9fafb', bar: '#d1d5db' },
};

const CYCLES = [2024, 2022, 2020];

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function LeanBadge({ lean }: { lean: Lean }) {
  const cfg = LEAN_CONFIG[lean] ?? LEAN_CONFIG.unknown;
  return (
    <span className="inline-block text-caption font-semibold rounded px-2 py-0.5" style={{ color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

function LeanBreakdown({ rows }: { rows: Contribution[] }) {
  const total = rows.reduce((s, c) => s + c.amount, 0);
  if (total === 0) return null;

  const buckets: Record<Lean, number> = { pro_chamber: 0, anti_chamber: 0, neutral: 0, unknown: 0 };

  for (const c of rows) {
    const lean = (c.donor_type !== 'individual' && c.donor_organizations?.lean)
      ? c.donor_organizations.lean
      : 'unknown';
    buckets[lean] += c.amount;
  }

  const order: Lean[] = ['pro_chamber', 'anti_chamber', 'neutral', 'unknown'];

  return (
    <div className="card p-6 mb-6">
      <h3 className="text-heading-3 mb-1">Funding Alignment</h3>
      <p className="text-caption text-primary-400 mb-4">Based on donor organization classification across all contributions this cycle</p>

      {/* Stacked bar */}
      <div className="flex rounded-full overflow-hidden h-4 mb-4" style={{ background: '#f3f4f6' }}>
        {order.map(lean => {
          const pct = total > 0 ? (buckets[lean] / total) * 100 : 0;
          if (pct < 1) return null;
          return (
            <div
              key={lean}
              style={{ width: `${pct}%`, background: LEAN_CONFIG[lean].bar }}
              title={`${LEAN_CONFIG[lean].label}: ${Math.round(pct)}%`}
            />
          );
        })}
      </div>

      {/* Legend rows */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {order.map(lean => {
          const amount = buckets[lean];
          const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
          const cfg = LEAN_CONFIG[lean];
          return (
            <div key={lean} className="rounded-xl p-3" style={{ border: `1px solid ${cfg.bg === '#f9fafb' ? '#e5e7eb' : cfg.bg}`, background: cfg.bg }}>
              <div className="text-caption font-semibold mb-0.5" style={{ color: cfg.color }}>{cfg.label}</div>
              <div className="text-xl font-bold text-primary-950">{pct}%</div>
              <div className="text-caption text-primary-400">{fmt(amount)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CollapsibleTable({
  title,
  subtitle,
  rows,
  type,
  defaultOpen = true,
}: {
  title: string;
  subtitle: string;
  rows: Contribution[];
  type: 'org' | 'individual';
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const filtered = rows.filter(r =>
    type === 'org' ? r.donor_type !== 'individual' : r.donor_type === 'individual'
  );

  if (filtered.length === 0) return null;

  const total = filtered.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:bg-stone-50"
        style={{ background: open ? 'var(--surface-canvas)' : 'white' }}
      >
        <div>
          <span className="font-semibold text-primary-950 text-body-sm">{title}</span>
          <span className="text-caption text-primary-400 ml-3">{fmt(total)} · {filtered.length} donor{filtered.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-caption text-primary-400">{subtitle}</span>
          <span className="text-primary-400 text-lg leading-none">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-caption border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-canvas)' }}>
                <th className="text-left px-5 py-2 font-semibold text-primary-500">Donor</th>
                {type === 'org' && <th className="text-left px-3 py-2 font-semibold text-primary-500">Alignment</th>}
                <th className="text-right px-5 py-2 font-semibold text-primary-500">Amount</th>
                <th className="text-right px-5 py-2 font-semibold text-primary-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const lean = r.donor_organizations?.lean ?? 'unknown';
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50">
                    <td className="px-5 py-2.5 text-primary-900 font-medium">{r.donor_name}</td>
                    {type === 'org' && (
                      <td className="px-3 py-2.5">
                        <LeanBadge lean={lean} />
                      </td>
                    )}
                    <td className="px-5 py-2.5 text-right font-mono text-primary-900">{fmt(r.amount)}</td>
                    <td className="px-5 py-2.5 text-right text-primary-400">
                      {r.contribution_date
                        ? new Date(r.contribution_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : `${r.cycle_year}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FundingTab({ contributions }: Props) {
  const [activeCycle, setActiveCycle] = useState<number>(
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

  const cycleTotals = CYCLES.map(y => ({
    year: y,
    total: contributions.filter(c => c.cycle_year === y).reduce((s, c) => s + c.amount, 0),
    count: contributions.filter(c => c.cycle_year === y).length,
    hasData: contributions.some(c => c.cycle_year === y),
  }));

  const cycleRows = contributions.filter(c => c.cycle_year === activeCycle);

  return (
    <div className="space-y-6">
      {/* Cycle selector */}
      <div className="card p-6">
        <h3 className="text-heading-3 mb-4">Fundraising by Cycle</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cycleTotals.map(({ year, total, count, hasData }) => (
            <button
              key={year}
              onClick={() => hasData && setActiveCycle(year)}
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

      {/* Lean breakdown headline */}
      <LeanBreakdown rows={cycleRows} />

      {/* Contribution tables */}
      <div className="space-y-3">
        <CollapsibleTable
          title="Organizations & PACs"
          subtitle="All contributions"
          rows={cycleRows}
          type="org"
          defaultOpen
        />
        <CollapsibleTable
          title="Individual Donors"
          subtitle="$1,000+ only"
          rows={cycleRows}
          type="individual"
          defaultOpen={false}
        />
      </div>

      {/* Link to org intelligence page */}
      <p className="text-caption text-primary-400 text-center">
        See how donor organizations are classified →{' '}
        <a href="/funding-intelligence" className="underline hover:text-primary-700">Funding Intelligence</a>
      </p>
    </div>
  );
}
