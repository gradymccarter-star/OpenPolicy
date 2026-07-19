'use client';

import { useState } from 'react';
import { donorProfileUrl } from '@/lib/utils/helpers';

type Lean = 'pro_chamber' | 'anti_chamber' | 'neutral' | 'unknown';

export interface Contribution {
  id: string;
  donor_name: string;
  donor_type: 'individual' | 'organization' | 'pac' | 'party' | 'other';
  amount: number;
  contribution_date: string | null;
  cycle_year: number;
  donor_org_id: string | null;
  followthemoney_id?: string | null;
  donor_organizations: {
    lean: Lean;
    industry: string | null;
  } | null;
}

interface Props {
  contributions: Contribution[];
}

const LEAN_CONFIG: Record<Lean, { label: string; color: string; bg: string; bar: string }> = {
  pro_chamber:  { label: 'Pro-Chamber',  color: 'var(--verdigris)', bg: 'rgba(47,111,82,0.12)', bar: 'var(--verdigris)' },
  anti_chamber: { label: 'Anti-Chamber', color: 'var(--oxblood)', bg: 'rgba(158,59,49,0.12)', bar: 'var(--oxblood)' },
  neutral:      { label: 'Neutral',      color: 'var(--ink-secondary)', bg: 'var(--well)', bar: 'var(--ink-tertiary)' },
  unknown:      { label: 'Neutral / Unknown', color: 'var(--ink-secondary)', bg: 'var(--well)', bar: 'var(--ink-faint)' },
};

const CYCLES = [2024, 2022, 2020];

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

function LeanBadge({ lean }: { lean: Lean }) {
  const cfg = LEAN_CONFIG[lean] ?? LEAN_CONFIG.unknown;
  return (
    <span className="inline-block font-semibold rounded-sm px-1.5 py-0.5 tracking-wide" style={{ color: cfg.color, background: cfg.bg, fontSize: '0.68rem' }}>
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
            strokeWidth="2"
            style={{ fill: LEAN_CONFIG[lean].bar, stroke: 'var(--card)' }}
          />
        ))}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="20" fontWeight="bold" className="figure" style={{ fill: cfg.color }}>
          {dominantPct}%
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize="9" fontWeight="500" style={{ fill: 'var(--ink-tertiary)' }}>
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
      <h3 className="text-heading-3 mb-1">Funding Alignment — <span className="figure">{cycle}</span> Election Cycle</h3>
      <p className="text-caption text-primary-400 mb-4">Breakdown of <span className="figure">{fmt(total)}</span> raised during the <span className="figure">{cycle}</span> cycle by donor organization alignment</p>

      <div className="flex flex-col md:flex-row gap-6 items-center">
        <DonutChart buckets={buckets} total={total} />

        <div className="flex-1 space-y-3">
          {/* Stacked bar */}
          <div className="flex rounded-sm overflow-hidden h-3" style={{ background: 'var(--well)' }}>
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
                <div key={lean} className="rounded-md p-3" style={{ border: '1px solid var(--rule-soft)', background: cfg.bg }}>
                  <div className="text-caption font-semibold mb-0.5" style={{ color: cfg.color }}>{cfg.label}</div>
                  <div className="text-xl font-bold text-primary-950 figure">{pct}%</div>
                  <div className="text-caption text-primary-400 figure">{fmt(amount)}</div>
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
    <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--rule)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors hover:bg-primary-50"
        style={{ background: open ? 'var(--well)' : 'var(--card)' }}
      >
        <div>
          <span className="font-semibold text-primary-950 text-body-sm">{title}</span>
          <span className="text-caption text-primary-400 ml-3"><span className="figure">{fmt(total)}</span> · <span className="figure">{filtered.length}</span> donor{filtered.length !== 1 ? 's' : ''}</span>
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
              <tr style={{ borderBottom: '1px solid var(--rule)', background: 'var(--well)' }}>
                <th className="text-left px-5 py-2 font-semibold text-primary-500">Donor</th>
                {type === 'org' && <th className="text-left px-3 py-2 font-semibold text-primary-500">Alignment</th>}
                <th className="text-right px-5 py-2 font-semibold text-primary-500">Amount</th>
                <th className="text-right px-5 py-2 font-semibold text-primary-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const lean = r.donor_organizations?.lean ?? 'unknown';
                const profileUrl = donorProfileUrl(r.followthemoney_id);
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--rule-soft)' }} className="hover:bg-primary-50">
                    <td className="px-5 py-2.5 text-primary-900 font-medium">
                      {profileUrl ? (
                        <a
                          href={profileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          title="View this donor's profile on FollowTheMoney.org"
                        >
                          {r.donor_name}
                        </a>
                      ) : (
                        r.donor_name
                      )}
                    </td>
                    {type === 'org' && (
                      <td className="px-3 py-2.5">
                        <LeanBadge lean={lean} />
                      </td>
                    )}
                    <td className="px-5 py-2.5 text-right figure text-primary-900">{fmt(r.amount)}</td>
                    <td className="px-5 py-2.5 text-right text-primary-400 figure">
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
          Run <code className="px-1 rounded-sm" style={{ background: 'var(--well)' }}>scripts/jobs/fetch-campaign-finance.js</code> to populate.
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
          className="rounded-lg p-4 flex items-center justify-between transition-colors cursor-pointer"
          style={{ background: 'var(--card)', border: '1px solid var(--rule)' }}
        >
          <div>
            <p className="overline mb-0.5">
              Funding Intelligence
            </p>
            <p className="text-caption" style={{ color: 'var(--ink-secondary)' }}>
              See how every donor organization is classified by PA Chamber alignment →
            </p>
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="ml-4 flex-shrink-0" style={{ color: 'var(--brass-bright)' }}>
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
          <div className="rounded-lg px-5 py-4 flex flex-wrap gap-4 items-center" style={{ background: 'var(--card)', border: '1px solid var(--rule)' }}>
            <div>
              <div className="text-caption text-primary-400 mb-0.5">Total raised across all cycles</div>
              <div className="text-xl font-bold text-primary-950 figure">{fmt(allTotal)}</div>
            </div>
            <div className="w-px h-8 hidden md:block" style={{ background: 'var(--rule)' }} />
            <div>
              <div className="text-caption text-primary-400 mb-0.5">Election cycles covered</div>
              <div className="text-body-sm font-bold text-primary-950 figure">{cycles.join(' · ')}</div>
            </div>
            <div className="w-px h-8 hidden md:block" style={{ background: 'var(--rule)' }} />
            <div>
              <div className="text-caption text-primary-400 mb-0.5">Total donor contributions</div>
              <div className="text-body-sm font-bold text-primary-950 figure">{allDonors.toLocaleString()}</div>
            </div>
            <a
              href="https://www.followthemoney.org"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-caption text-primary-400 hidden md:block hover:underline"
            >
              Source: FollowTheMoney.org ↗
            </a>
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
              className="text-left rounded-md p-4 transition-colors"
              style={{
                border: `1px solid ${activeCycle === year ? 'var(--brass)' : 'var(--rule)'}`,
                boxShadow: activeCycle === year ? 'inset 0 0 0 1px var(--brass)' : 'none',
                background: activeCycle === year ? 'var(--brass-wash)' : 'var(--card)',
                opacity: hasData ? 1 : 0.4,
                cursor: hasData ? 'pointer' : 'default',
              }}
            >
              <div className="text-caption font-semibold mb-0.5" style={{ color: activeCycle === year ? 'var(--brass)' : 'var(--ink-tertiary)' }}>
                <span className="figure">{year}</span> Election Cycle
              </div>
              <div className="text-body-sm font-bold text-primary-950 figure">{hasData ? fmt(total) : '—'}</div>
              {hasData && <div className="text-caption text-primary-400 mt-0.5"><span className="figure">{count.toLocaleString()}</span> contribution{count === 1 ? '' : 's'}</div>}
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
