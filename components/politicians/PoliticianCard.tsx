import Link from 'next/link';
import Image from 'next/image';
import { CandidacyBadge, PartyBadge } from '@/components/ui/Badge';
import { getScoreColor, formatScore, rescaleScore, getCandidacyStatus } from '@/lib/utils/helpers';
import type { PoliticianWithScores } from '@/lib/utils/types';

interface PoliticianCardProps {
  readonly politician: PoliticianWithScores;
  readonly hasFunding?: boolean;
  readonly committeeRole?: string | null;
  readonly normalizedScore?: number | null;
}

export default function PoliticianCard({ politician, hasFunding = false, committeeRole = null, normalizedScore }: PoliticianCardProps) {
  const os = politician.overall_score;
  const hasRecord = (os?.total_evidence_items ?? 0) > 0;
  const overallScore = os?.overall_score || 0;
  const scaled = rescaleScore(overallScore);

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
      <div className="card card-hover overflow-hidden h-full">
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start gap-3.5 mb-5">
            <div
              className="relative w-12 h-12 rounded-md overflow-hidden flex-shrink-0"
              style={{ background: 'var(--well)', border: '1px solid var(--rule)' }}
            >
              {politician.photo_url ? (
                <Image
                  src={politician.photo_url}
                  alt={politician.full_name}
                  fill
                  className="object-cover"
                  style={{ objectPosition: '50% 15%' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-serif text-base font-semibold text-primary-500">
                  {politician.first_name[0]}
                  {politician.last_name[0]}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-primary-950 truncate leading-snug">
                {politician.full_name}
              </h3>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap gap-y-1">
                <PartyBadge party={politician.party} />
                <CandidacyBadge status={getCandidacyStatus(politician)} />
                {politician.district && (
                  <span className="figure text-caption text-primary-500" style={{ fontSize: '0.7rem' }}>
                    HD-{politician.district}
                  </span>
                )}
                {politician.county && (
                  <span className="text-caption text-primary-400" style={{ fontSize: '0.7rem' }}>
                    {politician.county} Co.
                  </span>
                )}
                {hasFunding && (
                  <span
                    className="figure inline-flex items-center rounded-sm px-1.5 py-0.5 font-semibold"
                    style={{ fontSize: '0.65rem', background: 'var(--verdigris)', color: 'var(--card)' }}
                    title="Campaign finance data available"
                  >
                    $
                  </span>
                )}
              </div>
              {committeeRole && (
                <p
                  className="text-caption font-medium mt-1.5 truncate"
                  style={{ color: 'var(--brass)', fontSize: '0.7rem' }}
                  title={`Committee leadership: ${committeeRole}`}
                >
                  {committeeRole}
                </p>
              )}
            </div>

            <div className="text-right flex-shrink-0">
              {hasRecord ? (
                <>
                  <div className="figure text-2xl font-semibold" style={{ color: getScoreColor(scaled) }}>
                    {formatScore(scaled)}
                  </div>
                  <p className="figure text-caption mt-0.5" style={{ color: 'var(--ink-tertiary)', fontSize: '0.68rem' }}>
                    {normalizedScore != null ? `${normalizedScore}th pct.` : '—'}
                  </p>
                </>
              ) : (
                <div className="text-caption text-primary-400 font-medium max-w-[90px] text-center">
                  No record yet
                </div>
              )}
            </div>
          </div>

          {/* Nine-priority scorecard strip */}
          {hasRecord ? (
            <div
              className="grid grid-cols-9 gap-px rounded-md overflow-hidden"
              style={{ border: '1px solid var(--rule-soft)', background: 'var(--rule-soft)' }}
            >
              {['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'].map((key) => {
                const score = principleScores[key] || 0;
                const color = getScoreColor(score);
                const height = score * 100;

                return (
                  <div key={key} className="flex flex-col items-center pt-1.5 pb-1" style={{ background: 'var(--card)' }}>
                    <div className="w-2 h-9 relative overflow-hidden rounded-sm" style={{ background: 'var(--well)' }}>
                      <div
                        className="absolute bottom-0 w-full transition-all duration-500"
                        style={{ height: `${height}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="figure text-primary-400 mt-1" style={{ fontSize: '0.6rem' }}>
                      {key}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-caption text-primary-400 italic font-serif">
              Declared candidate — no voting record yet.
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
