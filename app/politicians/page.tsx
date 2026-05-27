import PoliticiansClient from '@/components/politicians/PoliticiansClient';
import { getDB } from '@/lib/db/client';
import { EXAMPLE_POLITICIANS } from '@/lib/utils/constants';
import type { PoliticianWithScores } from '@/lib/utils/types';

async function getPoliticians() {
  const db = getDB();

  const politicians = await db<PoliticianWithScores[]>`
    SELECT
      p.*,
      row_to_json(os.*) as overall_score
    FROM politicians p
    LEFT JOIN overall_scores os ON p.id = os.politician_id
    WHERE p.is_active = true
    ORDER BY os.overall_score DESC NULLS LAST, p.full_name
  `;

  return politicians;
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
          All Politicians
        </h1>
        <p className="text-body-sm text-primary-500">
          {displayPoliticians.length} senators evaluated for AI governance alignment
        </p>
      </div>

      <PoliticiansClient politicians={displayPoliticians} showExamples={showExamples} />
    </main>
  );
}

export const dynamic = 'force-dynamic';
