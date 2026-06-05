import Link from 'next/link';
import Image from 'next/image';
import PoliticianCard from '@/components/politicians/PoliticianCard';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { cacheGet, cacheSet } from '@/lib/cache/redis';
import { CACHE_TTL, EXAMPLE_POLITICIANS } from '@/lib/utils/constants';
import type { PoliticianWithScores } from '@/lib/utils/types';

async function getStats() {
  const cached = await cacheGet<any>('stats');
  if (cached) return cached;

  const supabase = getSupabase();

  const [{ count: politiciansCount }, { count: evidenceCount }, { count: claimsCount }] =
    await Promise.all([
      supabase.from('politicians').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('evidence_items').select('*', { count: 'exact', head: true }).eq('is_relevant', true),
      supabase.from('extracted_claims').select('*', { count: 'exact', head: true }),
    ]);

  const stats = {
    politicians: politiciansCount ?? 0,
    evidence_items: evidenceCount ?? 0,
    claims: claimsCount ?? 0,
  };

  await cacheSet('stats', stats, CACHE_TTL.STATS);
  return stats;
}

async function getTopPoliticians(limit: number = 6) {
  const cached = await cacheGet<PoliticianWithScores[]>('top-politicians');
  if (cached) return cached;

  const supabase = getSupabase();

  const { data } = await supabase
    .from('politicians')
    .select('*, overall_scores(*)')
    .eq('is_active', true)
    .order('full_name')
    .limit(limit * 2); // fetch extra so we can sort by score in JS

  const politicians = (data ?? [])
    .map((row) => ({ ...row, overall_score: extractOverallScore(row) }) as PoliticianWithScores)
    .sort((a, b) => (b.overall_score?.overall_score ?? 0) - (a.overall_score?.overall_score ?? 0))
    .slice(0, limit);

  await cacheSet('top-politicians', politicians, CACHE_TTL.POLITICIANS_LIST);
  return politicians;
}

export default async function HomePage() {
  let stats = { politicians: 0, evidence_items: 0, claims: 0 };
  let topPoliticians: PoliticianWithScores[] = [];

  try {
    stats = await getStats();
    topPoliticians = await getTopPoliticians();
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
      <section className="relative py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/hero-capitol.jpg"
            alt="US Capitol building at night"
            fill
            className="object-cover grayscale"
            priority
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>
        <div className="container-page relative z-10 text-center animate-fade-in">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-6">
            Endorsement Intelligence
          </h1>
          <p className="text-base sm:text-lg lg:text-xl text-white/70 max-w-2xl mx-auto mb-10">
            Evidence-based candidate scoring for the Pennsylvania Chamber of Commerce.{' '}
            Every claim is cited. Every score is explainable.
          </p>
          <Link href="/politicians" className="btn-primary">
            View Candidates &rarr;
          </Link>
        </div>
      </section>

      {/* Mission Statement + Image */}
      <section className="container-page py-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden">
            <Image
              src="/mission-statement.jpg"
              alt="A view of the United States Capitol"
              fill
              className="object-cover grayscale"
            />
          </div>
          <div className="flex items-center">
            <div>
              <h2 className="text-heading-2 font-bold leading-snug text-primary-950">
                Smart endorsement decisions require more than a voting record.
              </h2>
              <p className="mt-2 text-primary-500 font-medium text-xl">We surface what&apos;s hard to find.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why This Matters */}
      <section className="py-8 lg:py-10" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <h2 className="text-heading-1 mb-4">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-start">
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden">
              <Image
                src="/hero-capitol.jpg"
                alt="US Capitol building"
                fill
                className="object-cover grayscale"
              />
            </div>
            <div className="space-y-3">
              <p className="text-body-sm text-primary-500 leading-relaxed">
                Voting records only tell part of the story. We surface bill sponsorships,
                committee votes, public statements, press coverage, and questionnaire
                responses — then score each candidate against the Chamber&apos;s nine business priorities.
              </p>
              <p className="text-caption text-primary-400 leading-relaxed">
                Every score links back to its source. Your team can verify any claim before
                presenting an endorsement recommendation.
              </p>
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div>
                  <p className="text-heading-3 font-bold">{stats.politicians || 0}</p>
                  <p className="text-caption text-primary-400">Candidates Tracked</p>
                </div>
                <div>
                  <p className="text-heading-3 font-bold">{stats.evidence_items || 0}</p>
                  <p className="text-caption text-primary-400">Evidence Items</p>
                </div>
                <div>
                  <p className="text-heading-3 font-bold">{stats.claims || 0}</p>
                  <p className="text-caption text-primary-400">Claims Extracted</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Top Politicians */}
      <section className="py-10 lg:py-14">
        <div className="container-page">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-heading-2">
              {showExamples ? 'Example Candidates' : 'PA House Candidates'}
            </h2>
            <Link
              href="/politicians"
              className="text-body-sm font-medium text-primary-500 hover:text-primary-950 transition-colors"
            >
              View All &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayPoliticians.slice(0, 6).map((politician) => (
              <PoliticianCard key={politician.id} politician={politician} />
            ))}
          </div>

          {showExamples && (
            <p className="text-center text-caption text-primary-400 mt-6">
              Example data shown. Run the evaluation pipeline to see real scores.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

export const dynamic = 'force-dynamic';
