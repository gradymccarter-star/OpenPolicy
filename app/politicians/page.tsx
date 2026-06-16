import PoliticiansClient from '@/components/politicians/PoliticiansClient';
import { getSupabase, extractOverallScore } from '@/lib/db/client';
import { EXAMPLE_POLITICIANS } from '@/lib/utils/constants';
import type { PoliticianWithScores } from '@/lib/utils/types';

async function getPoliticianIdsWithFunding() {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('campaign_contributions')
    .select('politician_id');
  return Array.from(new Set((data ?? []).map((r: { politician_id: string }) => r.politician_id)));
}

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

interface Props {
  readonly searchParams: Promise<{ q?: string }>;
}

export default async function PoliticiansPage({ searchParams }: Props) {
  const { q } = await searchParams;
  let politicians: PoliticianWithScores[] = [];
  let politicianIdsWithFunding: string[] = [];

  try {
    [politicians, politicianIdsWithFunding] = await Promise.all([
      getPoliticians(),
      getPoliticianIdsWithFunding(),
    ]);
  } catch (error) {
    console.error('Failed to load politicians:', error);
  }

  const showExamples = politicians.length === 0;
  const displayPoliticians = showExamples
    ? (EXAMPLE_POLITICIANS as unknown as PoliticianWithScores[])
    : politicians;

  return (
    <main className="container-page py-10">
      <div className="mb-6">
        <p className="text-caption font-semibold uppercase tracking-widest mb-1" style={{ color: '#c9a84c' }}>
          2026 Pennsylvania House of Representatives
        </p>
        <h1 className="text-heading-1 mb-1">Member Directory</h1>
        <p className="text-body-sm text-primary-500">
          All {displayPoliticians.length} active members scored against PA Chamber&apos;s 9 business priorities
        </p>
      </div>

      <PoliticiansClient politicians={displayPoliticians} showExamples={showExamples} initialQuery={q ?? ''} politicianIdsWithFunding={politicianIdsWithFunding} />
    </main>
  );
}

export const dynamic = 'force-dynamic';
