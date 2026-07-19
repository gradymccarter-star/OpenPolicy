import Link from 'next/link';
import PoliticianCard from '@/components/politicians/PoliticianCard';
import Keystone from '@/components/ui/Keystone';
import PaOutline from '@/components/ui/PaOutline';
import HomeSearch from '@/components/ui/HomeSearch';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { getCandidacyStatus } from '@/lib/utils/helpers';
import { getContactInfoForDistrict, getCommitteeChairLabel } from '@/lib/data/contact-info';
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
      {/* Masthead — the cover page of the brief */}
      <section className="relative overflow-hidden" style={{ borderBottom: '1px solid var(--rule)' }}>
        <div className="container-page relative py-16 md:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,340px] gap-12 lg:gap-16 items-center">
            <div>
              <p className="hero-fade-up overline">
                PA Chamber of Commerce · 2026 Endorsement Cycle
              </p>

              <h1 className="hero-fade-up text-display text-primary-950 mt-3 mb-6" style={{ animationDelay: '0.08s' }}>
                Legislative intelligence for PA&nbsp;House endorsements
              </h1>

              <p className="hero-fade-up text-body text-primary-600 mb-8 max-w-xl" style={{ animationDelay: '0.16s' }}>
                Evidence-based scoring for {stats.politicians > 0 ? `all ${stats.politicians} PA House candidates` : 'every PA House candidate'} —
                ranked against the Chamber&apos;s nine business priorities, with every claim cited to its source.
              </p>

              <div className="hero-fade-up max-w-xl" style={{ animationDelay: '0.24s' }}>
                <HomeSearch />
              </div>

              <div className="hero-fade-up flex items-center gap-6 mt-5 text-body-sm" style={{ animationDelay: '0.3s' }}>
                <Link href="/politicians" className="font-medium text-primary-600 hover:text-primary-950 transition-colors">
                  Browse all candidates →
                </Link>
                <Link href="/compare" className="font-medium text-primary-600 hover:text-primary-950 transition-colors">
                  Compare members
                </Link>
                <Link href="/overview" className="font-medium text-primary-600 hover:text-primary-950 transition-colors">
                  District map
                </Link>
              </div>
            </div>

            {/* Cycle card — the commonwealth at a glance */}
            <div className="hero-fade-up hidden lg:block" style={{ animationDelay: '0.2s' }}>
              <div className="card p-7">
                <div className="flex items-center justify-between mb-5">
                  <p className="overline" style={{ fontSize: '0.65rem' }}>The Commonwealth</p>
                  <Keystone size={16} style={{ color: 'var(--brass-bright)' }} />
                </div>
                <PaOutline
                  className="w-full mb-6"
                  strokeWidth={1.5}
                  style={{ color: 'var(--brass-bright)' }}
                />
                <dl>
                  {[
                    { label: 'House districts', value: '203' },
                    { label: 'Chamber priorities', value: '9' },
                    { label: 'General election', value: 'Nov 3, 2026' },
                  ].map((row, i) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between py-2.5"
                      style={i > 0 ? { borderTop: '1px solid var(--rule-soft)' } : undefined}
                    >
                      <dt className="text-caption text-primary-500">{row.label}</dt>
                      <dd className="figure text-body-sm font-semibold text-primary-950">{row.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Ledger row — the numbers of record */}
        <div style={{ borderTop: '1px solid var(--rule)', background: 'var(--card)' }}>
          <div className="container-page grid grid-cols-3">
            {[
              { value: stats.politicians, label: 'PA House Members' },
              { value: stats.evidence_items, label: 'Evidence Items' },
              { value: stats.claims, label: 'Policy Claims Scored' },
            ].map((stat, i) => (
              <div
                key={stat.label}
                className="py-6 text-center sm:text-left"
                style={i > 0 ? { borderLeft: '1px solid var(--rule-soft)', paddingLeft: '2rem' } : undefined}
              >
                <p className="figure text-2xl font-semibold text-primary-950">
                  {stat.value.toLocaleString()}
                </p>
                <p className="text-caption font-medium uppercase text-primary-400 mt-1" style={{ letterSpacing: '0.08em', fontSize: '0.68rem' }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20">
        <div className="container-page">
          <div className="max-w-xl mb-14">
            <p className="overline">How It Works</p>
            <h2 className="text-heading-2 text-primary-950 mt-3 mb-3">
              From public record to endorsement brief
            </h2>
            <p className="text-body-sm text-primary-600">
              We analyze every PA House member&apos;s legislative record against the Chamber&apos;s nine business
              priorities — automatically, with cited sources your team can verify.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                num: '01',
                title: 'Collect evidence',
                desc: 'Floor votes, bill sponsorships, and press coverage for every PA House candidate — pulled from public legislative records.',
              },
              {
                num: '02',
                title: 'Score against nine priorities',
                desc: 'AI classifies each piece of evidence against priorities like taxes, energy, labor, and infrastructure — with confidence scores.',
              },
              {
                num: '03',
                title: 'Generate endorsement briefs',
                desc: 'One-page brief with a staff recommendation, issue-by-issue breakdown, and cited sources — ready to print.',
              },
            ].map((step) => (
              <div key={step.num} className="card p-7">
                <p className="figure text-caption font-semibold mb-5" style={{ color: 'var(--brass)' }}>
                  {step.num}
                </p>
                <h3 className="text-heading-4 text-primary-950 mb-2">{step.title}</h3>
                <p className="text-body-sm text-primary-600 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Top candidates */}
      <section className="pb-24">
        <div className="container-page">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="overline">Top Scoring Members</p>
              <h2 className="text-heading-2 text-primary-950 mt-3">
                {showExamples ? 'Example candidates' : 'Highest Chamber alignment'}
              </h2>
            </div>
            <Link
              href="/politicians"
              className="hidden sm:inline-flex text-body-sm font-medium text-primary-600 hover:text-primary-950 transition-colors"
            >
              View all {stats.politicians > 0 ? stats.politicians : ''} candidates →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayPoliticians.slice(0, 6).map((politician) => (
              <PoliticianCard
                key={politician.id}
                politician={politician}
                committeeRole={
                  getCandidacyStatus(politician) === 'incumbent'
                    ? getCommitteeChairLabel(getContactInfoForDistrict(politician.district))
                    : null
                }
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export const dynamic = 'force-dynamic';
