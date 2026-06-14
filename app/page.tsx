import Link from 'next/link';
import PoliticianCard from '@/components/politicians/PoliticianCard';
import PaOutline from '@/components/ui/PaOutline';
import Keystone from '@/components/ui/Keystone';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { EXAMPLE_POLITICIANS } from '@/lib/utils/constants';
import type { PoliticianWithScores } from '@/lib/utils/types';

async function getStats() {
  const supabase = getSupabase();
  const [{ count: politiciansCount }, { count: evidenceCount }, { count: claimsCount }] =
    await Promise.all([
      supabase.from('politicians').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('evidence_items').select('*', { count: 'exact', head: true }).eq('is_relevant', true),
      supabase.from('extracted_claims').select('*', { count: 'exact', head: true }),
    ]);
  return {
    politicians: politiciansCount ?? 0,
    evidence_items: evidenceCount ?? 0,
    claims: claimsCount ?? 0,
  };
}

async function getTopPoliticians(limit = 6) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('politicians')
    .select('*, overall_scores(*)')
    .eq('is_active', true)
    .order('full_name')
    .limit(limit * 2);

  return (data ?? [])
    .map((row) => ({ ...row, overall_score: extractOverallScore(row) }) as PoliticianWithScores)
    .sort((a, b) => (b.overall_score?.overall_score ?? 0) - (a.overall_score?.overall_score ?? 0))
    .slice(0, limit);
}

export default async function HomePage() {
  let stats = { politicians: 0, evidence_items: 0, claims: 0 };
  let topPoliticians: PoliticianWithScores[] = [];

  try {
    [stats, topPoliticians] = await Promise.all([getStats(), getTopPoliticians()]);
  } catch (error) {
    console.error('Failed to load homepage data:', error);
  }

  const showExamples = topPoliticians.length === 0;
  const displayPoliticians = showExamples
    ? (EXAMPLE_POLITICIANS as unknown as PoliticianWithScores[])
    : topPoliticians;

  return (
    <main>
      {/* Hero */}
      <section className="relative py-24 md:py-32 overflow-hidden" style={{ background: '#0a1628' }}>
        {/* PA state outline — large, subtle, right side */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none select-none opacity-10" style={{ width: '55%' }}>
          <PaOutline style={{ color: 'white', width: '100%', height: 'auto' }} strokeWidth={1.5} />
        </div>

        <div className="container-page relative z-10 text-center">
          <div className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full text-caption font-semibold tracking-widest uppercase" style={{ background: 'rgba(255,255,255,0.1)', color: '#c9a84c' }}>
            <Keystone size={14} style={{ color: '#c9a84c' }} />
            2026 PA House Elections
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-5">
            PA Chamber<br />Endorsement Intelligence
          </h1>
          <p className="text-lg text-white/60 max-w-2xl mx-auto mb-3">
            Evidence-based scoring for all 209 Pennsylvania House candidates — ranked against the Chamber&apos;s nine business priorities. Every score is traceable.
          </p>
          <p className="text-caption tracking-widest uppercase mb-10" style={{ color: '#c9a84c', opacity: 0.7 }}>
            Virtue, Liberty and Independence
          </p>
          <Link href="/politicians" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all" style={{ background: '#c9a84c', color: '#0a1628' }}>
            Search Candidates &rarr;
          </Link>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ background: '#c9a84c' }}>
        <div className="container-page py-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold" style={{ color: '#0a1628' }}>{stats.politicians || 209}</p>
            <p className="text-caption font-semibold" style={{ color: '#0a1628', opacity: 0.7 }}>PA House Members</p>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: '#0a1628' }}>{stats.evidence_items.toLocaleString()}</p>
            <p className="text-caption font-semibold" style={{ color: '#0a1628', opacity: 0.7 }}>Evidence Items</p>
          </div>
          <div>
            <p className="text-2xl font-bold" style={{ color: '#0a1628' }}>{stats.claims.toLocaleString()}</p>
            <p className="text-caption font-semibold" style={{ color: '#0a1628', opacity: 0.7 }}>Policy Claims</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <h2 className="text-heading-2 mb-2">How It Works</h2>
          <p className="text-body-sm text-primary-500 mb-10 max-w-2xl">
            We analyze every PA House member&apos;s legislative record against the Chamber&apos;s 9 business priorities — automatically, with cited sources your team can verify.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { num: '1', title: 'Collect Evidence', desc: 'Floor votes, bill sponsorships, Bluesky posts, and news coverage for all 209 PA House members are collected from public legislative records and press sources.' },
              { num: '2', title: 'AI Scores Against 9 Priorities', desc: 'Claude AI classifies each piece of evidence against priorities like Taxes, Energy, Labor, and Infrastructure — with confidence scores and rationale.' },
              { num: '3', title: 'Generate Endorsement Briefs', desc: 'Click any member to get a one-page endorsement brief with a staff recommendation, issue-by-issue breakdown, and cited sources.' },
            ].map(step => (
              <div key={step.num} className="p-6 rounded-xl bg-white" style={{ border: '1px solid var(--border)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-body-sm mb-4" style={{ background: '#0a1628' }}>
                  {step.num}
                </div>
                <h3 className="font-bold text-primary-950 mb-2">{step.title}</h3>
                <p className="text-caption text-primary-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Top candidates */}
      <section className="py-16">
        <div className="container-page">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="text-heading-2 mb-1">
                {showExamples ? 'Example Candidates' : 'Top PA House Candidates'}
              </h2>
              <p className="text-body-sm text-primary-500">Highest Chamber alignment scores</p>
            </div>
            <Link href="/politicians" className="btn-secondary text-caption py-2 px-4">
              View All 209 &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayPoliticians.slice(0, 6).map((politician) => (
              <PoliticianCard key={politician.id} politician={politician} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export const dynamic = 'force-dynamic';
