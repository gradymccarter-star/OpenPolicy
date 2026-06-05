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
    <main className="container-page py-12">
      <h1 className="text-heading-1 mb-2">
        Compare Politicians
      </h1>
      <p className="text-body-sm text-primary-500 mb-8">
        Select two politicians to compare their AI policy alignment scores
      </p>

      <CompareClient
        allPoliticians={allPoliticians}
        initialA={searchParams.a}
        initialB={searchParams.b}
      />
    </main>
  );
}

export const dynamic = 'force-dynamic';
