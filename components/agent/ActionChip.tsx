'use client';

import { useRouter } from 'next/navigation';
import type { AgentAction } from '@/lib/ai/agent/types';

export default function ActionChip({ action }: { readonly action: AgentAction }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(action.url)}
      className="btn-secondary text-caption py-2 px-4 inline-flex items-center gap-1.5 mt-2"
    >
      {action.label} &rarr;
    </button>
  );
}
