import PoliticianCard from '@/components/politicians/PoliticianCard';
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayPoliticians.map((politician) => (
          <PoliticianCard key={politician.id} politician={politician} />
        ))}
      </div>

      {showExamples && (
        <p className="text-center text-caption text-primary-400 mt-8">
          Example data shown. Run the evaluation pipeline to see real scores.
        </p>
      )}
    </main>
  );
}

export const dynamic = 'force-dynamic';
