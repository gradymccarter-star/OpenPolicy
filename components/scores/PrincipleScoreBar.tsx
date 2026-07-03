import Link from 'next/link';
import { getScoreColor, formatScore, getConfidenceColor } from '@/lib/utils/helpers';

interface PrincipleScoreBarProps {
  principleName: string;
  score: number;
  confidence: number;
  numEvidenceItems?: number;
  numVotes?: number;
  numSponsorships?: number;
  numStatements?: number;
  principleKey?: string;
}

export default function PrincipleScoreBar({
  principleName,
  score,
  confidence,
  numEvidenceItems,
  numVotes,
  numSponsorships,
  numStatements,
  principleKey,
}: PrincipleScoreBarProps) {
  const color = getScoreColor(score);
  const percentage = score * 100;
  const confColor = getConfidenceColor(confidence);

  const parts: string[] = [];
  if (numVotes && numVotes > 0) parts.push(`${numVotes} vote${numVotes > 1 ? 's' : ''}`);
  if (numSponsorships && numSponsorships > 0) parts.push(`${numSponsorships} sponsorship${numSponsorships > 1 ? 's' : ''}`);
  if (numStatements && numStatements > 0) parts.push(`${numStatements} statement${numStatements > 1 ? 's' : ''}`);
  const evidenceSummary = parts.length > 0 ? parts.join(', ') : undefined;
  const hasEvidence = (numEvidenceItems ?? 0) > 0;

  const body = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-body-sm font-medium text-primary-950">
          {principleName}
        </h4>
        <div className="flex items-center space-x-2">
          <span className="text-body-sm font-semibold" style={{ color }}>
            {formatScore(score)}
          </span>
          <span className="text-caption font-medium" style={{ color: confColor }}>
            ({Math.round(confidence * 100)}% confidence)
          </span>
        </div>
      </div>
      <div className="w-full rounded-full h-2" style={{ background: 'var(--surface-canvas)' }}>
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>
      {evidenceSummary && numEvidenceItems !== undefined && (
        <p className="text-caption text-primary-400">
          Based on {numEvidenceItems} item{numEvidenceItems !== 1 ? 's' : ''}: {evidenceSummary}
          {principleKey && hasEvidence && <span className="ml-1 font-medium text-primary-700">— view evidence &rarr;</span>}
        </p>
      )}
    </div>
  );

  if (!principleKey || !hasEvidence) return body;

  return (
    <Link href={`?principle=${principleKey}#evidence-trail`} scroll={false} className="block -m-2 p-2 rounded-lg transition-colors hover:bg-slate-50">
      {body}
    </Link>
  );
}
