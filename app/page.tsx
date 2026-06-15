import Link from 'next/link';
import PoliticianCard from '@/components/politicians/PoliticianCard';
import Keystone from '@/components/ui/Keystone';
import HeroBackground from '@/components/ui/HeroBackground';
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
      <section
        className="relative py-28 md:py-36 overflow-hidden"
        style={{ background: '#07111f' }}
      >
        {/* PA state flag — full bleed, darkened */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/pa-flag.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.18,
          }}
        />

        {/* Dark gradient overlay so text stays readable */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(7,17,31,0.55) 0%, rgba(7,17,31,0.75) 60%, rgba(7,17,31,0.95) 100%)',
          }}
        />

        {/* Dot grid on top */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Animated particles, light sweep, glow */}
        <HeroBackground />

        <div className="container-page relative z-10 text-center">
          <div
            className="hero-fade-up inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full text-caption font-semibold tracking-widest uppercase"
            style={{ background: 'rgba(201,168,76,0.12)', color: '#c9a84c', border: '1px solid rgba(201,168,76,0.25)', animationDelay: '0s' }}
          >
            <Keystone size={12} style={{ color: '#c9a84c' }} />
            PA Chamber · Fall 2026
          </div>

          <h1
            className="hero-fade-up text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-6 leading-tight"
            style={{ animationDelay: '0.15s' }}
          >
            Legislative Intelligence<br />
            <span style={{ color: '#c9a84c' }}>for PA House Endorsements</span>
          </h1>

          <p
            className="hero-fade-up text-lg md:text-xl mb-10 max-w-xl mx-auto"
            style={{ color: 'rgba(255,255,255,0.5)', animationDelay: '0.3s' }}
          >
            Evidence-based scoring for all 209 PA House members — ranked against the Chamber&apos;s nine business priorities.
          </p>

          <div className="hero-fade-up flex flex-col sm:flex-row items-center justify-center gap-4" style={{ animationDelay: '0.45s' }}>
            <Link
              href="/politicians"
              className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl text-lg font-bold transition-all duration-200 hover:scale-105 hover:shadow-2xl"
              style={{ background: '#c9a84c', color: '#07111f' }}
            >
              Explore All {stats.politicians || 209} Candidates
              <span className="text-xl transition-transform group-hover:translate-x-1">→</span>
            </Link>
            <Link
              href="/compare"
              className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl text-base font-semibold transition-all hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              Compare Members
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ background: '#0a1628', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="container-page py-5 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{stats.politicians || 209}</p>
            <p className="text-caption font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>PA House Members</p>
          </div>
          <div style={{ borderLeft: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="text-2xl font-bold" style={{ color: '#c9a84c' }}>{stats.evidence_items.toLocaleString()}</p>
            <p className="text-caption font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Evidence Items</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{stats.claims.toLocaleString()}</p>
            <p className="text-caption font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Policy Claims Scored</p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <div className="max-w-xl mb-12">
            <p className="text-caption font-semibold uppercase tracking-widest mb-3" style={{ color: '#c9a84c' }}>
              How It Works
            </p>
            <h2 className="text-heading-2 text-primary-950 mb-3">From public record to endorsement brief in seconds</h2>
            <p className="text-body-sm text-primary-500">
              We analyze every PA House member&apos;s legislative record against the Chamber&apos;s 9 business priorities — automatically, with cited sources your team can verify.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                num: '01',
                title: 'Collect Evidence',
                desc: 'Floor votes, bill sponsorships, and press coverage for all 209 PA House members — pulled from public legislative records.',
              },
              {
                num: '02',
                title: 'Score Against 9 Priorities',
                desc: 'AI classifies each piece of evidence against priorities like Taxes, Energy, Labor, and Infrastructure — with confidence scores.',
              },
              {
                num: '03',
                title: 'Generate Endorsement Briefs',
                desc: 'One-page brief with a staff recommendation, issue-by-issue breakdown, and cited sources — ready to print.',
              },
            ].map((step) => (
              <div
                key={step.num}
                className="p-7 rounded-2xl bg-white"
                style={{ border: '1px solid var(--border)' }}
              >
                <p className="text-3xl font-bold mb-4" style={{ color: '#e8e4dc' }}>{step.num}</p>
                <h3 className="font-bold text-primary-950 mb-2 text-body-sm">{step.title}</h3>
                <p className="text-caption text-primary-500 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Top candidates */}
      <section className="py-20" style={{ background: '#fff' }}>
        <div className="container-page">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-caption font-semibold uppercase tracking-widest mb-2" style={{ color: '#c9a84c' }}>
                Top Scoring Members
              </p>
              <h2 className="text-heading-2 text-primary-950">
                {showExamples ? 'Example Candidates' : 'Highest Chamber Alignment'}
              </h2>
            </div>
            <Link
              href="/politicians"
              className="text-caption font-semibold transition-colors hover:opacity-80"
              style={{ color: '#0a1628', border: '1px solid #0a1628', padding: '6px 16px', borderRadius: '8px' }}
            >
              View all 209 &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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
