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
  unknown:      { label: 'Neutral / Unknown', color: '#6b7280', bg: '#f9fafb', bar: '#d1d5db' },
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

function DonutChart({ buckets, total }: { buckets: Record<Lean, number>; total: number }) {
  const SIZE = 160;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = 64;
  const IR = 40;

  const order: Lean[] = ['pro_chamber', 'anti_chamber', 'neutral', 'unknown'];
  const segments: Array<{ lean: Lean; startAngle: number; endAngle: number }> = [];

  let startAngle = -Math.PI / 2;
  for (const lean of order) {
    const pct = total > 0 ? buckets[lean] / total : 0;
    if (pct < 0.005) continue;
    const sweep = pct * 2 * Math.PI;
    segments.push({ lean, startAngle, endAngle: startAngle + sweep });
    startAngle += sweep;
  }

  if (segments.length === 0) return null;

  function makeArcPath(sa: number, ea: number): string {
    const fullCircle = Math.abs(ea - sa) >= 2 * Math.PI - 0.001;
    if (fullCircle) {
      const mid = sa + Math.PI;
      return [
        `M ${CX + R * Math.cos(sa)} ${CY + R * Math.sin(sa)}`,
        `A ${R} ${R} 0 1 1 ${CX + R * Math.cos(mid)} ${CY + R * Math.sin(mid)}`,
        `A ${R} ${R} 0 1 1 ${CX + R * Math.cos(sa)} ${CY + R * Math.sin(sa)}`,
        `L ${CX + IR * Math.cos(sa)} ${CY + IR * Math.sin(sa)}`,
        `A ${IR} ${IR} 0 1 0 ${CX + IR * Math.cos(mid)} ${CY + IR * Math.sin(mid)}`,
        `A ${IR} ${IR} 0 1 0 ${CX + IR * Math.cos(sa)} ${CY + IR * Math.sin(sa)}`,
        'Z',
      ].join(' ');
    }
    const largeArc = ea - sa > Math.PI ? 1 : 0;
    const ox1 = CX + R * Math.cos(sa); const oy1 = CY + R * Math.sin(sa);
    const ox2 = CX + R * Math.cos(ea); const oy2 = CY + R * Math.sin(ea);
    const ix1 = CX + IR * Math.cos(ea); const iy1 = CY + IR * Math.sin(ea);
    const ix2 = CX + IR * Math.cos(sa); const iy2 = CY + IR * Math.sin(sa);
    return [
      `M ${ox1} ${oy1}`,
      `A ${R} ${R} 0 ${largeArc} 1 ${ox2} ${oy2}`,
      `L ${ix1} ${iy1}`,
      `A ${IR} ${IR} 0 ${largeArc} 0 ${ix2} ${iy2}`,
      'Z',
    ].join(' ');
  }

  const dominant = order.reduce((best, lean) =>
    buckets[lean] > buckets[best] ? lean : best, order[0]
  );
  const dominantPct = total > 0 ? Math.round((buckets[dominant] / total) * 100) : 0;
  const cfg = LEAN_CONFIG[dominant];

  return (
    <div className="flex-shrink-0 flex flex-col items-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {segments.map(({ lean, startAngle, endAngle }) => (
          <path
            key={lean}
            d={makeArcPath(startAngle, endAngle)}
            fill={LEAN_CONFIG[lean].bar}
            stroke="white"
            strokeWidth="2"
          />
        ))}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="20" fontWeight="bold" fill={cfg.color}>
          {dominantPct}%
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize="9" fill="#9ca3af" fontWeight="500">
          {cfg.label}
        </text>
      </svg>
    </div>
  );
}

function LeanBreakdown({ rows, cycle }: { readonly rows: Contribution[]; readonly cycle: number }) {
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
      <h3 className="text-heading-3 mb-1">Funding Alignment — {cycle} Election Cycle</h3>
      <p className="text-caption text-primary-400 mb-4">Breakdown of {fmt(total)} raised during the {cycle} cycle by donor organization alignment</p>

      <div className="flex flex-col md:flex-row gap-6 items-center">
        <DonutChart buckets={buckets} total={total} />

        <div className="flex-1 space-y-3">
          {/* Stacked bar */}
          <div className="flex rounded-full overflow-hidden h-3" style={{ background: '#f3f4f6' }}>
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

          {/* Legend grid */}
          <div className="grid grid-cols-2 gap-2">
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
                        : `${r.cycle_year} cycle`}
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
      {/* Funding Intelligence banner */}
      <a href="/funding-intelligence">
        <div
          className="rounded-xl p-4 flex items-center justify-between transition-opacity hover:opacity-90 cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #0a1628 0%, #162444 100%)', border: '1px solid #c9a84c' }}
        >
          <div>
            <p className="text-caption font-bold uppercase tracking-wider mb-0.5" style={{ color: '#c9a84c' }}>
              Funding Intelligence
            </p>
            <p className="text-caption" style={{ color: 'rgba(255,255,255,0.65)' }}>
              See how every donor organization is classified by PA Chamber alignment →
            </p>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" strokeWidth="2" strokeLinecap="round" className="ml-4 flex-shrink-0">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </a>

      {/* Cross-cycle summary */}
      {(() => {
        const allTotal = cycleTotals.filter(c => c.hasData).reduce((s, c) => s + c.total, 0);
        const cycles = cycleTotals.filter(c => c.hasData).map(c => c.year);
        const allDonors = cycleTotals.filter(c => c.hasData).reduce((s, c) => s + c.count, 0);
        return allTotal > 0 ? (
          <div className="rounded-xl px-5 py-4 flex flex-wrap gap-4 items-center" style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}>
            <div>
              <div className="text-caption text-primary-400 mb-0.5">Total raised across all cycles</div>
              <div className="text-xl font-bold text-primary-950">{fmt(allTotal)}</div>
            </div>
            <div className="w-px h-8 hidden md:block" style={{ background: 'var(--border)' }} />
            <div>
              <div className="text-caption text-primary-400 mb-0.5">Election cycles covered</div>
              <div className="text-body-sm font-bold text-primary-950">{cycles.join(' · ')}</div>
            </div>
            <div className="w-px h-8 hidden md:block" style={{ background: 'var(--border)' }} />
            <div>
              <div className="text-caption text-primary-400 mb-0.5">Total donor contributions</div>
              <div className="text-body-sm font-bold text-primary-950">{allDonors.toLocaleString()}</div>
            </div>
            <div className="ml-auto text-caption text-primary-400 hidden md:block">Source: FollowTheMoney.org</div>
          </div>
        ) : null;
      })()}

      {/* Cycle selector */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-heading-3">Fundraising by Election Cycle</h3>
          <span className="text-caption text-primary-400">Select a cycle to explore</span>
        </div>
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
              <div className="text-caption font-semibold mb-0.5" style={{ color: activeCycle === year ? '#c9a84c' : 'var(--primary-400)' }}>
                {year} Election Cycle
              </div>
              <div className="text-body-sm font-bold text-primary-950">{hasData ? fmt(total) : '—'}</div>
              {hasData && <div className="text-caption text-primary-400 mt-0.5">{count.toLocaleString()} contribution{count === 1 ? '' : 's'}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Lean breakdown with donut chart */}
      <LeanBreakdown rows={cycleRows} cycle={activeCycle} />

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
    </div>
  );
}
