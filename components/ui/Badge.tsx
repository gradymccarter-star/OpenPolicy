import type { CandidacyStatus, PartyType } from '@/lib/utils/types';
import { getPartyName } from '@/lib/utils/helpers';

const PARTY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  D: { bg: 'bg-democrat-100', text: 'text-democrat-700', border: 'border-democrat-200' },
  R: { bg: 'bg-republican-100', text: 'text-republican-700', border: 'border-republican-200' },
  I: { bg: 'bg-independent-100', text: 'text-independent-600', border: 'border-independent-200' },
};

interface BadgeProps {
  party: PartyType;
  className?: string;
}

export function PartyBadge({ party, className = '' }: BadgeProps) {
  const name = getPartyName(party);
  const styles = PARTY_STYLES[party] || PARTY_STYLES.I;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-caption font-semibold tracking-wide ${styles.bg} ${styles.text} ${className}`}
      style={{ fontSize: '0.68rem' }}
    >
      {name}
    </span>
  );
}

export function CandidacyBadge({ status, className = '' }: { readonly status: CandidacyStatus; readonly className?: string }) {
  if (status !== 'challenger') return null;
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-caption font-semibold tracking-wide ${className}`}
      style={{ fontSize: '0.68rem', background: 'var(--brass-wash)', color: 'var(--brass)' }}
    >
      Challenger
    </span>
  );
}

export function StateBadge({ state }: { state: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-caption font-medium text-primary-500" style={{ background: 'var(--well)' }}>
      {state}
    </span>
  );
}
