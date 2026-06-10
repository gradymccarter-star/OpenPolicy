import PoliticiansClient from '@/components/politicians/PoliticiansClient';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { EXAMPLE_POLITICIANS } from '@/lib/utils/constants';
import type { PoliticianWithScores } from '@/lib/utils/types';

async function getPoliticians() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('politicians')
    .select('*, overall_scores(*)')
    .eq('is_active', true)
    .order('full_name');

  if (error) throw error;

  const politicians = (data ?? []).map((row) => ({
    ...row,
    overall_score: extractOverallScore(row),
  })) as PoliticianWithScores[];

  return politicians.toSorted((a, b) =>
    (b.overall_score?.overall_score ?? 0) - (a.overall_score?.overall_score ?? 0)
  );
}

export default async function PoliticiansPage() {
  let politicians: PoliticianWithScores[] = [];

  try {
    politicians = await getPoliticians();
  } catch (error) {
    console.error('Failed to load politicians:', error);
  }

  const showExamples = politicians.length === 0;
  const displayPoliticians = showExamples
    ? (EXAMPLE_POLITICIANS as unknown as PoliticianWithScores[])
    : politicians;

  return (
    <main className="container-page py-12">
      <div className="mb-8">
        <h1 className="text-heading-1 mb-2">
          PA House Candidates
        </h1>
        <p className="text-body-sm text-primary-500">
          {displayPoliticians.length} candidate{displayPoliticians.length === 1 ? '' : 's'} scored against PA Chamber business priorities
        </p>
      </div>

      <PoliticiansClient politicians={displayPoliticians} showExamples={showExamples} />
    </main>
  );
}

export const dynamic = 'force-dynamic';
