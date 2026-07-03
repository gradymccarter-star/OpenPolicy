'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';
import EvidenceAccordion from './EvidenceAccordion';
import FundingTab, { type Contribution } from './FundingTab';
import ContactTab from './ContactTab';
import { PA_CHAMBER_PRINCIPLES } from '@/lib/utils/constants';
import type { DistrictContactInfo, PoliticianWithScores } from '@/lib/utils/types';

interface EvidenceItem {
  id: string;
  evidence_type: string;
  source_text?: string | null;
  source_url?: string | null;
  source_date?: string | null;
  vote_position?: string | null;
  bill_title?: string | null;
  tagged_principles?: string[] | null;
  claims?: any[];
}

interface Props {
  evidenceItems: EvidenceItem[];
  contributions: Contribution[];
  principleScoresSection: React.ReactNode;
  methodologySection: React.ReactNode;
  politician: PoliticianWithScores;
  contactInfo: DistrictContactInfo | null;
}

const TABS = [
  { id: 'analysis', label: 'Analysis' },
  { id: 'funding', label: 'Funding' },
  { id: 'contact', label: 'Contact' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function ProfileTabs({ evidenceItems, contributions, principleScoresSection, methodologySection, politician, contactInfo }: Props) {
  const [active, setActive] = useState<TabId>('analysis');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const principleFilter = searchParams.get('principle');

  useEffect(() => {
    if (principleFilter) setActive('analysis');
  }, [principleFilter]);

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'var(--surface-canvas)' }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className="px-5 py-2 rounded-lg text-body-sm font-semibold transition-all"
            style={{
              background: active === tab.id ? 'white' : 'transparent',
              color: active === tab.id ? 'var(--primary-950)' : 'var(--primary-400)',
              boxShadow: active === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}
          >
            {tab.label}
            {tab.id === 'funding' && contributions.length > 0 && (
              <span
                className="ml-2 text-caption rounded-full px-1.5 py-0.5"
                style={{ background: '#c9a84c', color: 'white', fontSize: '10px' }}
              >
                {contributions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {active === 'analysis' && (
        <div className="space-y-8">
          {principleScoresSection}
          {methodologySection}
          <div id="evidence-trail" className="card p-8" style={{ scrollMarginTop: '2rem' }}>
            <h2 className="text-heading-3 mb-2">Evidence Trail</h2>
            <p className="text-body-sm text-primary-400 mb-6">
              Every score is traceable to the specific evidence items below, organized by source type. Click any folder to expand it.
            </p>
            {principleFilter && (
              <div
                className="flex items-center justify-between mb-4 px-4 py-2.5 rounded-lg"
                style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)' }}
              >
                <p className="text-body-sm font-medium text-primary-800">
                  Filtered to evidence tagged <strong>{PA_CHAMBER_PRINCIPLES[principleFilter]?.name ?? principleFilter}</strong>
                </p>
                <Link href={pathname} scroll={false} className="text-caption font-semibold text-primary-500 hover:text-primary-950 hover:underline">
                  Clear filter
                </Link>
              </div>
            )}
            <EvidenceAccordion items={evidenceItems} principleFilter={principleFilter} />
          </div>
        </div>
      )}

      {active === 'funding' && (
        <FundingTab contributions={contributions} />
      )}

      {active === 'contact' && (
        <ContactTab politician={politician} contactInfo={contactInfo} />
      )}
    </div>
  );
}
