import Link from 'next/link';
import Image from 'next/image';
import PoliticianCard from '@/components/politicians/PoliticianCard';
import { getDB } from '@/lib/db/client';
import { cacheGet, cacheSet } from '@/lib/cache/redis';
import { CACHE_TTL, EXAMPLE_POLITICIANS } from '@/lib/utils/constants';
import type { PoliticianWithScores } from '@/lib/utils/types';

async function getStats() {
  const cached = await cacheGet<any>('stats');
  if (cached) return cached;

  const db = getDB();

  const [politiciansResult, evidenceResult, claimsResult] = await Promise.all([
    db`SELECT COUNT(*) as count FROM politicians WHERE is_active = true`,
    db`SELECT COUNT(*) as count FROM evidence_items WHERE is_relevant = true`,
    db`SELECT COUNT(*) as count FROM extracted_claims`,
  ]);

  const stats = {
    politicians: parseInt(politiciansResult[0].count),
    evidence_items: parseInt(evidenceResult[0].count),
    claims: parseInt(claimsResult[0].count),
  };

  await cacheSet('stats', stats, CACHE_TTL.STATS);
  return stats;
}

async function getTopPoliticians(limit: number = 6) {
  const cached = await cacheGet<PoliticianWithScores[]>('top-politicians');
  if (cached) return cached;

  const db = getDB();

  const politicians = await db<PoliticianWithScores[]>`
    SELECT
      p.*,
      row_to_json(os.*) as overall_score
    FROM politicians p
    JOIN overall_scores os ON p.id = os.politician_id
    WHERE p.is_active = true
    ORDER BY os.overall_score DESC
    LIMIT ${limit}
  `;

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
            OpenPolicy AI
          </h1>
          <p className="text-lg lg:text-xl text-white/70 max-w-2xl mx-auto mb-10 whitespace-nowrap sm:whitespace-normal">
            Search any politician. See their score. Understand their alignment&nbsp;with&nbsp;AI.
          </p>
          <Link href="/politicians" className="btn-primary">
            Explore The Scores &rarr;
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
            <h2 className="text-heading-2 font-bold leading-snug text-primary-950">
              AI is the most consequential technology of our generation.
              <span className="block mt-2">The public deserves a say.</span>
            </h2>
          </div>
        </div>
      </section>

      {/* Why This Matters */}
      <section className="py-8 lg:py-10" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <h2 className="text-heading-1 mb-4">Why This Matters</h2>
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
                Over 1,000 AI bills were introduced last year. Most voters couldn&apos;t name one.
                That&apos;s the problem we&apos;re solving.
              </p>
              <p className="text-caption text-primary-400 leading-relaxed">
                We analyze politicians&apos; records on AI policy using transparent,
                verifiable metrics aligned with OECD principles.
              </p>
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div>
                  <p className="text-heading-3 font-bold">{stats.politicians || 100}</p>
                  <p className="text-caption text-primary-400">Senators Tracked</p>
                </div>
                <div>
                  <p className="text-heading-3 font-bold">{stats.evidence_items || 366}</p>
                  <p className="text-caption text-primary-400">Evidence Items</p>
                </div>
                <div>
                  <p className="text-heading-3 font-bold">{stats.claims || 1200}</p>
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
              {showExamples ? 'Example Evaluations' : 'Senators'}
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
