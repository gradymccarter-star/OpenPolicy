import CompareClient from '@/components/compare/CompareClient';
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
      <section className="py-14 lg:py-20" style={{ borderBottom: '1px solid var(--rule)' }}>
        <div className="container-page">
          <p className="hero-fade-up overline">
            Side-by-Side Analysis
          </p>
          <h1 className="hero-fade-up text-4xl lg:text-5xl text-primary-950 mt-3 mb-3 leading-tight" style={{ animationDelay: '0.08s' }}>
            Compare Members
          </h1>
          <p className="hero-fade-up text-body-sm text-primary-600 max-w-xl" style={{ animationDelay: '0.16s' }}>
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
