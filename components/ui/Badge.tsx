import type { PartyType } from '@/lib/utils/types';
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
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-caption font-medium border ${styles.bg} ${styles.text} ${styles.border} ${className}`}
    >
      {name}
    </span>
  );
}

export function StateBadge({ state }: { state: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-medium text-primary-500" style={{ background: 'var(--surface-canvas)' }}>
      {state}
    </span>
  );
}
