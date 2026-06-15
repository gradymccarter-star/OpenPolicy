import CompareClient from '@/components/compare/CompareClient';
import HeroBackground from '@/components/ui/HeroBackground';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { EXAMPLE_POLITICIANS } from '@/lib/utils/constants';
import type { PoliticianWithScores } from '@/lib/utils/types';

async function getAllPoliticians(): Promise<PoliticianWithScores[]> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('politicians')
      .select('*, overall_scores(*)')
      .eq('is_active', true)
      .order('full_name');

    return (data ?? []).map((row) => ({
      ...row,
      overall_score: extractOverallScore(row),
    })) as PoliticianWithScores[];
  } catch {
    return [];
  }
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: { a?: string; b?: string };
}) {
  let allPoliticians: PoliticianWithScores[] = await getAllPoliticians();

  if (allPoliticians.length === 0) {
    allPoliticians = EXAMPLE_POLITICIANS as unknown as PoliticianWithScores[];
  }

  return (
    <main>
      {/* Hero */}
      <section className="relative py-14 lg:py-20 overflow-hidden" style={{ background: '#07111f' }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse at 30% 50%, rgba(201,168,76,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(59,130,246,0.06) 0%, transparent 60%)',
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.025) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <HeroBackground />
        <div className="container-page relative z-10">
          <p className="text-caption font-semibold uppercase tracking-widest mb-3" style={{ color: '#c9a84c' }}>
            Side-by-Side Analysis
          </p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-3 leading-tight">
            Compare <span style={{ color: '#c9a84c' }}>Members</span>
          </h1>
          <p className="text-body-sm max-w-xl" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Select two PA House members to compare their Chamber alignment scores across all 9 business priorities.
          </p>
        </div>
      </section>

      <div className="container-page py-10">
        <CompareClient
          allPoliticians={allPoliticians}
          initialA={searchParams.a}
          initialB={searchParams.b}
        />
      </div>
    </main>
  );
}

export const dynamic = 'force-dynamic';
