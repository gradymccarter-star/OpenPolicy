import Link from 'next/link';
import Image from 'next/image';
import { PartyBadge } from '@/components/ui/Badge';
import { getScoreColor, formatScore, getConfidenceColor } from '@/lib/utils/helpers';
import type { PoliticianWithScores } from '@/lib/utils/types';

interface PoliticianCardProps {
  politician: PoliticianWithScores;
}

export default function PoliticianCard({ politician }: PoliticianCardProps) {
  const os = politician.overall_score;
  const overallScore = os?.overall_score || 0;
  const overallConfidence = os?.overall_confidence || 0;

  const principleScores: Record<string, number> = {
    P1: os?.p1_score ?? 0,
    P2: os?.p2_score ?? 0,
    P3: os?.p3_score ?? 0,
    P4: os?.p4_score ?? 0,
    P5: os?.p5_score ?? 0,
    P6: os?.p6_score ?? 0,
    P7: os?.p7_score ?? 0,
    P8: os?.p8_score ?? 0,
    P9: os?.p9_score ?? 0,
  };

  return (
    <Link href={`/politicians/${politician.id}`}>
      <div className="card card-hover overflow-hidden">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start space-x-3 mb-4">
            <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0" style={{ background: 'var(--surface-canvas)', border: '2px solid var(--border)' }}>
              {politician.photo_url ? (
                <Image
                  src={politician.photo_url}
                  alt={politician.full_name}
                  fill
                  className="object-cover grayscale"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-lg font-bold text-primary-950">
                  {politician.first_name[0]}
                  {politician.last_name[0]}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-body-sm font-bold text-primary-950 truncate">
                {politician.full_name}
              </h3>
              <div className="flex items-center space-x-1.5 mt-1 flex-wrap gap-y-1">
                <PartyBadge party={politician.party} />
                {politician.district && (
                  <span className="text-caption text-primary-400">Dist. {politician.district}</span>
                )}
                {politician.county && (
                  <span className="text-caption text-primary-400">{politician.county} Co.</span>
                )}
              </div>
            </div>

            <div className="text-right">
              <div
                className="text-2xl font-bold"
                style={{ color: getScoreColor(overallScore) }}
              >
                {formatScore(overallScore)}
              </div>
              <p className="text-caption font-medium" style={{ color: getConfidenceColor(overallConfidence) }}>
                {Math.round(overallConfidence * 100)}% conf
              </p>
            </div>
          </div>

          {/* Mini Principle Breakdown */}
          <div className="grid grid-cols-9 gap-1">
            {['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'].map((key) => {
              const score = principleScores[key] || 0;
              const color = getScoreColor(score);
              const height = score * 100;

              return (
                <div key={key} className="flex flex-col items-center">
                  <div className="w-full h-10 rounded relative overflow-hidden" style={{ background: 'var(--surface-canvas)' }}>
                    <div
                      className="absolute bottom-0 w-full rounded transition-all duration-500"
                      style={{
                        height: `${height}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="text-caption text-primary-400 mt-1 font-medium">
                    {key}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Link>
  );
}
