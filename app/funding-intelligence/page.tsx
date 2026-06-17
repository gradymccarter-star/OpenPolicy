import { getSupabase } from '@/lib/db/client';
import Link from 'next/link';

type Lean = 'pro_chamber' | 'anti_chamber' | 'neutral' | 'unknown';

const LEAN_CONFIG: Record<Lean, { label: string; color: string; bg: string; border: string; description: string }> = {
  pro_chamber: {
    label: 'Pro-Chamber',
    color: '#166534',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    description: 'Organizations that typically advocate for pro-business policies aligned with the PA Chamber\'s nine priorities: lower taxes, streamlined permitting, civil justice reform, fiscal responsibility, workforce development, energy access, labor flexibility, infrastructure investment, and healthcare cost reduction.',
  },
  anti_chamber: {
    label: 'Anti-Chamber',
    color: '#991b1b',
    bg: '#fef2f2',
    border: '#fecaca',
    description: 'Organizations that typically oppose Chamber priorities. This includes labor unions that advocate for collective bargaining protections, minimum wage mandates, and prevailing wage laws (which conflict with P7: Labor); and trial lawyer associations that oppose civil justice reform (P3). These organizations\' legislative goals frequently conflict with the Chamber\'s policy agenda.',
  },
  neutral: {
    label: 'Neutral / Unknown',
    color: '#374151',
    bg: '#f9fafb',
    border: '#e5e7eb',
    description: 'Organizations that take positions on both sides of Chamber issues, or whose policy positions are not consistently aligned or opposed to the Chamber\'s priorities.',
  },
  unknown: {
    label: 'Unclassified',
    color: '#6b7280',
    bg: '#f9fafb',
    border: '#e5e7eb',
    description: 'Organizations that have not yet been classified. This includes individual donors (who are not organizations), small PACs with limited public record, and newly identified donors. Individual donors of $1,000+ are tracked but not lean-classified.',
  },
};

const CATEGORY_NOTES: Record<string, { why: string; examples: string[] }> = {
  unions: {
    why: 'Labor unions consistently support legislation that increases labor costs for employers, opposes right-to-work laws, and mandates prevailing wage requirements on public contracts — all of which directly conflict with PA Chamber Priority 7 (Labor Relations & Workforce Flexibility).',
    examples: ['AFL-CIO', 'SEIU', 'UFCW', 'IBEW', 'Teamsters', 'AFSCME', 'Operating Engineers', 'Laborers International'],
  },
  trial_lawyers: {
    why: 'Trial lawyer associations (PAJ, PATLA, AAJ) actively oppose civil justice reform, including caps on non-economic damages, venue reform, and third-party litigation financing restrictions — the core of PA Chamber Priority 3 (Civil Justice Reform).',
    examples: ['Pennsylvania Association for Justice', 'Philadelphia Trial Lawyers Association', 'American Association for Justice'],
  },
  chambers: {
    why: 'State and local chambers of commerce, NFIB, and industry-specific business associations share the PA Chamber\'s core legislative agenda on taxes, regulation, and workforce policy.',
    examples: ['PA Chamber of Business & Industry', 'NFIB', 'National Association of Manufacturers', 'PA Manufacturers Association'],
  },
  realtors: {
    why: 'Realtor associations align with the Chamber on property rights, land use streamlining, and opposing excessive regulatory burdens on real estate development.',
    examples: ['PA Association of Realtors', 'National Association of Realtors'],
  },
  financial: {
    why: 'Banking and insurance associations align with the Chamber on financial regulation, opposing excessive fee mandates, and supporting a stable business legal environment.',
    examples: ['PA Bankers Association', 'Insurance Federation of Pennsylvania'],
  },
};

async function getAllContributions() {
  const supabase = getSupabase();
  const PAGE = 1000;
  let from = 0;
  const all: { donor_org_id: string | null; amount: number; cycle_year: number }[] = [];
  while (true) {
    const { data } = await supabase
      .from('campaign_contributions')
      .select('donor_org_id, amount, cycle_year')
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as any[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export default async function FundingIntelligencePage() {
  const supabase = getSupabase();

  const [{ data: orgs }, contributions] = await Promise.all([
    supabase
      .from('donor_organizations')
      .select('id, name, normalized_name, lean, industry, lean_rationale, lean_classified_by')
      .in('lean', ['pro_chamber', 'anti_chamber', 'neutral'])
      .order('name'),
    getAllContributions(),
  ]);

  // Build org totals and collect cycle years from all contributions
  const orgTotals = new Map<string, number>();
  const cycleSet = new Set<number>();

  for (const row of contributions) {
    if (row.cycle_year) cycleSet.add(row.cycle_year);
    if (!row.donor_org_id) continue;
    orgTotals.set(row.donor_org_id, (orgTotals.get(row.donor_org_id) ?? 0) + (Number(row.amount) || 0));
  }

  const cycles = [...cycleSet].sort();
  const cycleRange = cycles.length > 0
    ? cycles.length === 1
      ? `${cycles[0]} election cycle`
      : `${cycles[0]}–${cycles[cycles.length - 1]} election cycles`
    : 'all cycles';

  // Build byLean and derive leanTotals from classified org totals
  const classified = (orgs ?? []) as any[];
  const byLean: Record<Lean, any[]> = { pro_chamber: [], anti_chamber: [], neutral: [], unknown: [] };
  const leanTotals: Record<Lean, number> = { pro_chamber: 0, anti_chamber: 0, neutral: 0, unknown: 0 };

  for (const org of classified) {
    const lean = (org.lean ?? 'unknown') as Lean;
    const total = orgTotals.get(org.id) ?? 0;
    byLean[lean].push({ ...org, total });
    leanTotals[lean] += total;
  }
  for (const lean of Object.keys(byLean) as Lean[]) {
    byLean[lean].sort((a, b) => b.total - a.total);
  }

  const fmtDollars = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const totalTracked = leanTotals.pro_chamber + leanTotals.anti_chamber + leanTotals.neutral + leanTotals.unknown;

  return (
    <main className="container-page py-12">
      <div className="mb-8">
        <Link href="/politicians" className="text-caption text-primary-400 hover:text-primary-700 transition-colors">
          &larr; Back to candidates
        </Link>
        <h1 className="text-heading-1 mt-3 mb-2">Funding Intelligence</h1>
        <p className="text-body-sm text-primary-500 max-w-2xl">
          Every organization that donated to a PA House candidate is classified by its typical alignment with PA Chamber priorities.
          Classifications are based on the organization&apos;s known policy positions, lobbying history, and legislative advocacy.
        </p>
      </div>

      {/* Totals banner */}
      <div className="rounded-2xl mb-8 overflow-hidden" style={{ border: '1px solid #e5e7eb' }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: '#0a1628' }}>
          <div>
            <p className="text-caption font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#c9a84c' }}>
              Campaign Finance Summary
            </p>
            <p className="text-white/50 text-caption">
              {cycleRange} · {contributions.length.toLocaleString()} contributions tracked · FollowTheMoney.org
            </p>
          </div>
          <div className="text-right">
            <p className="text-white text-lg font-bold">{fmtDollars(totalTracked)}</p>
            <p className="text-white/40 text-caption">total classified</p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x" style={{ borderTop: '1px solid #e5e7eb' }}>
          {([
            { lean: 'pro_chamber' as Lean, label: 'Pro-Chamber', color: '#166534', bg: '#f0fdf4' },
            { lean: 'anti_chamber' as Lean, label: 'Anti-Chamber', color: '#991b1b', bg: '#fef2f2' },
            { lean: 'neutral' as Lean, label: 'Neutral / Unknown', color: '#374151', bg: '#f9fafb' },
          ]).map(({ lean, label, color, bg }) => {
            const total = leanTotals[lean];
            const pct = totalTracked > 0 ? (total / totalTracked * 100).toFixed(1) : '0.0';
            return (
              <div key={lean} className="px-6 py-4" style={{ background: bg }}>
                <p className="text-caption font-semibold mb-1" style={{ color }}>{label}</p>
                <p className="text-xl font-bold text-primary-950">{fmtDollars(total)}</p>
                <p className="text-caption text-primary-400">{pct}% of tracked total · {byLean[lean].length} orgs</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Why this matters */}
      <div className="card p-6 mb-8" style={{ borderLeft: '4px solid #c9a84c' }}>
        <h2 className="font-semibold text-primary-950 mb-2 text-body-sm">Why Donor Classification Matters</h2>
        <p className="text-caption text-primary-600 leading-relaxed">
          Campaign contributions reveal which constituencies a candidate is accountable to. A legislator who receives the majority of their funding
          from labor unions and trial lawyer associations is financially tied to organizations whose legislative goals frequently conflict with the
          Chamber&apos;s agenda — regardless of what they say on the campaign trail. Conversely, a candidate whose donor base consists primarily of
          business associations, manufacturers, and Chamber-aligned PACs signals structural alignment with pro-business priorities.
          This page documents how each donor organization is classified and why.
        </p>
      </div>

      {/* Category explanations */}
      <div className="card p-6 mb-8">
        <h2 className="text-heading-3 mb-4">Classification Categories</h2>
        <div className="space-y-4">
          {(Object.entries(LEAN_CONFIG) as [Lean, typeof LEAN_CONFIG[Lean]][]).map(([lean, cfg]) => (
            <div key={lean} className="rounded-xl p-4" style={{ border: `1px solid ${cfg.border}`, background: cfg.bg }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-body-sm" style={{ color: cfg.color }}>{cfg.label}</span>
              </div>
              <p className="text-caption text-primary-700 leading-relaxed">{cfg.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Specific category rationales */}
      <div className="card p-6 mb-8">
        <h2 className="text-heading-3 mb-4">Why Specific Donor Types Are Classified as Anti-Chamber or Pro-Chamber</h2>
        <div className="space-y-6">
          {Object.entries(CATEGORY_NOTES).map(([key, note]) => (
            <div key={key} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
              <p className="text-caption text-primary-700 leading-relaxed mb-2">{note.why}</p>
              <div className="flex flex-wrap gap-2">
                {note.examples.map(ex => (
                  <span key={ex} className="text-caption px-2.5 py-0.5 rounded-full" style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)', color: 'var(--primary-600)' }}>
                    {ex}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Org tables by lean — collapsible */}
      {(['pro_chamber', 'anti_chamber', 'neutral'] as Lean[]).map(lean => {
        const orgsForLean = byLean[lean];
        if (orgsForLean.length === 0) return null;
        const cfg = LEAN_CONFIG[lean];
        const sectionTotal = orgsForLean.reduce((s: number, o: any) => s + o.total, 0);
        return (
          <details key={lean} className="mb-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${cfg.border}` }}>
            <summary
              className="flex items-center justify-between px-6 py-4 cursor-pointer select-none list-none"
              style={{ background: cfg.bg }}
            >
              <div className="flex items-center gap-3">
                <span className="font-bold text-body-sm" style={{ color: cfg.color }}>{cfg.label} Organizations</span>
                <span className="text-caption text-primary-400 font-medium">{orgsForLean.length} orgs</span>
                <span className="text-caption font-semibold" style={{ color: cfg.color }}>{fmtDollars(sectionTotal)}</span>
                <span className="text-caption text-primary-400">· {cycleRange}</span>
              </div>
              <svg
                className="w-4 h-4 transition-transform details-chevron"
                style={{ color: cfg.color }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </summary>
            <div className="overflow-x-auto bg-white">
              <table className="w-full text-caption border-collapse">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-canvas)' }}>
                    <th className="text-left px-4 py-2 font-semibold text-primary-500">Organization</th>
                    <th className="text-left px-4 py-2 font-semibold text-primary-500">Classified By</th>
                    <th className="text-right px-4 py-2 font-semibold text-primary-500">Total to PA House Candidates ({cycleRange})</th>
                  </tr>
                </thead>
                <tbody>
                  {orgsForLean.map((org: any) => (
                    <tr key={org.id} style={{ borderBottom: '1px solid var(--border)' }} className="hover:bg-stone-50">
                      <td className="px-4 py-2.5 text-primary-900 font-medium">{org.name}</td>
                      <td className="px-4 py-2.5 text-primary-400 capitalize">
                        {org.lean_rationale ?? (org.lean_classified_by === 'rule' ? 'Automated (keyword match)' : org.lean_classified_by)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-primary-900">
                        {org.total > 0 ? fmtDollars(org.total) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}

      <p className="text-caption text-primary-400 text-center mt-6">
        Classifications are updated as new data is ingested. To manually update a classification, edit the <code className="bg-stone-100 px-1 rounded">donor_organizations</code> table in Supabase.
      </p>
    </main>
  );
}

export const dynamic = 'force-dynamic';
