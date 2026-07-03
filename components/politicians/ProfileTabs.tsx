'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';
import EvidenceAccordion from './EvidenceAccordion';
import FundingTab, { type Contribution } from './FundingTab';
import ContactTab from './ContactTab';
import { PA_CHAMBER_PRINCIPLES } from '@/lib/utils/constants';
import type { DistrictContactInfo, PoliticianWithScores, ElectionYearResult, BillStatus, CandidateYearResult, DistrictVoterRegistration, PAChamberMemberScore, PAChamberScorecardStats } from '@/lib/utils/types';

interface EvidenceItem {
  id: string;
  evidence_type: string;
  source_text?: string | null;
  source_url?: string | null;
  source_date?: string | null;
  vote_position?: string | null;
  bill_id?: string | null;
  bill_title?: string | null;
  tagged_principles?: string[] | null;
  claims?: any[];
}

interface Props {
  readonly evidenceItems: EvidenceItem[];
  readonly contributions: Contribution[];
  readonly principleScoresSection: React.ReactNode;
  readonly methodologySection: React.ReactNode;
  readonly politician: PoliticianWithScores;
  readonly contactInfo: DistrictContactInfo | null;
  readonly districtHistory?: Record<string, ElectionYearResult> | null;
  readonly billStatusMap?: Record<string, BillStatus>;
  readonly candidateResults?: Record<string, CandidateYearResult[]> | null;
  readonly voterRegistration?: DistrictVoterRegistration | null;
  readonly voterRegAsOf?: string | null;
  readonly pachamberScore?: PAChamberMemberScore | null;
  readonly pachamberStats?: PAChamberScorecardStats | null;
  readonly pachamberSession?: string | null;
  readonly aclupaScore?: PAChamberMemberScore | null;
  readonly aclupaStats?: PAChamberScorecardStats | null;
  readonly aclupaSession?: string | null;
}

function voteStyle(pos: string | null | undefined): React.CSSProperties {
  if (pos === 'yea') return { background: '#dcfce7', color: '#15803d' };
  if (pos === 'nay') return { background: '#fee2e2', color: '#dc2626' };
  return { background: 'var(--surface-canvas)', color: 'var(--primary-400)' };
}

function partyLabel(party: string | null | undefined): string {
  if (party === 'R') return 'Republican';
  if (party === 'D') return 'Democrat';
  return party ?? '—';
}

function winnerStyle(winner: string | null | undefined): React.CSSProperties {
  if (winner === 'R') return { background: '#fee2e2', color: '#dc2626' };
  if (winner === 'D') return { background: '#dbeafe', color: '#1d4ed8' };
  return { background: 'var(--surface-canvas)', color: 'var(--primary-400)' };
}

function winnerLabel(winner: string | null | undefined): string {
  if (winner === 'R') return 'Republican Win';
  if (winner === 'D') return 'Democrat Win';
  return 'Split';
}

function newsIcon(isVideo: boolean, evidenceType: string): string {
  if (isVideo) return '▶';
  if (evidenceType === 'social_media') return '↗';
  return '⊡';
}

function billStatusStyle(status: BillStatus | null | undefined): React.CSSProperties {
  if (!status) return {};
  if (status.status === 4) return { background: '#dcfce7', color: '#15803d' };
  if (status.status === 6) return { background: '#fee2e2', color: '#dc2626' };
  if (status.status === 5) return { background: '#fef3c7', color: '#92400e' };
  return { background: 'var(--surface-canvas)', color: 'var(--primary-500)' };
}

function candidatePartyStyle(party: string): React.CSSProperties {
  if (party === 'R') return { background: '#fee2e2', color: '#dc2626' };
  if (party === 'D') return { background: '#dbeafe', color: '#1d4ed8' };
  return { background: 'var(--surface-canvas)', color: 'var(--primary-400)' };
}

function sponsorBadgeStyle(isPrime: boolean): React.CSSProperties {
  if (isPrime) return { background: 'rgba(201,168,76,0.12)', color: '#92400e', border: '1px solid rgba(201,168,76,0.3)' };
  return { background: 'transparent', color: 'var(--primary-400)', border: '1px solid var(--border)' };
}

function SponsoredBills({ items, billStatusMap }: { readonly items: EvidenceItem[]; readonly billStatusMap: Record<string, BillStatus> }) {
  if (items.length === 0) return null;
  const shown = items.slice(0, 25);
  return (
    <SectionCard>
      <SectionHeading
        title="Bills & Resolutions"
        subtitle="Sponsored and co-sponsored legislation this session, with current status from LegiScan."
      />
      <div className="space-y-2">
        {shown.map((item) => {
          const status = item.bill_id ? billStatusMap[item.bill_id] : null;
          const isPrime = item.evidence_type === 'bill_sponsorship';
          return (
            <div
              key={item.id}
              className="flex items-start gap-3 px-4 py-3 rounded-xl"
              style={{ border: '1px solid var(--border)', background: 'var(--surface-canvas)' }}
            >
              <span className="flex-shrink-0 mt-0.5 text-caption font-semibold rounded-full px-2 py-0.5 whitespace-nowrap" style={sponsorBadgeStyle(isPrime)}>
                {isPrime ? 'Prime' : 'Co'}
              </span>
              <div className="flex-1 min-w-0">
                {item.source_url ? (
                  <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-body-sm text-primary-800 hover:underline line-clamp-2 leading-snug block">
                    {item.bill_title ?? 'Bill'}
                  </a>
                ) : (
                  <span className="text-body-sm text-primary-800 line-clamp-2 leading-snug block">{item.bill_title ?? 'Bill'}</span>
                )}
                {status?.last_action && (
                  <span className="text-caption text-primary-400 block mt-0.5">
                    {status.last_action}{status.last_action_date ? ` · ${status.last_action_date}` : ''}
                  </span>
                )}
              </div>
              {status && (
                <span className="flex-shrink-0 text-caption font-semibold rounded-full px-2 py-0.5 whitespace-nowrap" style={billStatusStyle(status)}>
                  {status.status_label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-caption text-primary-400 mt-4">
        Showing {shown.length} of {items.length} tracked bills. Status via{' '}
        <a href="https://legiscan.com/PA" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">LegiScan ↗</a>
      </p>
    </SectionCard>
  );
}

function scoreBand(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: 'Strong Supporter', color: '#15803d', bg: '#dcfce7' };
  if (score >= 60) return { label: 'Supporter', color: '#166534', bg: '#bbf7d0' };
  if (score >= 40) return { label: 'Mixed Record', color: '#92400e', bg: '#fef3c7' };
  if (score >= 20) return { label: 'Opponent', color: '#b91c1c', bg: '#fee2e2' };
  return { label: 'Strong Opponent', color: '#7f1d1d', bg: '#fecaca' };
}

function PAChamberScorecard({
  score,
  stats,
  session,
}: {
  readonly score: PAChamberMemberScore;
  readonly stats: PAChamberScorecardStats | null | undefined;
  readonly session: string | null | undefined;
}) {
  const band = scoreBand(score.score);
  const partyAvg = score.party === 'R' ? stats?.avg_rep_score : stats?.avg_dem_score;
  return (
    <div className="card p-8">
      <h2 className="text-heading-3 mb-1">PA Chamber Scorecard</h2>
      <p className="text-caption text-primary-400 mb-6">
        {session ?? '2025-2026'} session ·{' '}
        <a href="https://www.pachamber.org/advocacy/chamber_pac/legislative_scorecard/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">Source ↗</a>
      </p>

      <div className="flex flex-col items-center py-6 mb-6 rounded-xl" style={{ background: band.bg }}>
        <div className="text-6xl font-bold mb-2" style={{ color: band.color }}>{score.score}%</div>
        <div className="text-body-sm font-semibold" style={{ color: band.color }}>{band.label}</div>
      </div>

      <div className="mb-6">
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full" style={{ width: `${score.score}%`, background: band.color }} />
        </div>
        <div className="flex justify-between mt-1 text-caption text-primary-400">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>

      {stats && (
        <div className="space-y-2 mt-auto">
          {[
            { label: 'This Member', value: `${score.score}%`, accent: false },
            { label: `${score.party === 'R' ? 'Republican' : 'Democrat'} Avg`, value: `${partyAvg?.toFixed(0) ?? '—'}%`, accent: true },
            { label: 'House Average', value: `${stats.avg_score.toFixed(0)}%`, accent: false },
          ].map(({ label, value, accent }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--surface-canvas)' }}>
              <span className="text-caption text-primary-500">{label}</span>
              <span className="text-body-sm font-bold" style={{ color: accent ? (score.party === 'R' ? '#dc2626' : '#1d4ed8') : 'var(--primary-950)' }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function acluBand(score: number): { label: string; color: string; bg: string } {
  if (score >= 80) return { label: 'Very Progressive', color: '#1d4ed8', bg: '#dbeafe' };
  if (score >= 60) return { label: 'Progressive', color: '#1e40af', bg: '#bfdbfe' };
  if (score >= 40) return { label: 'Mixed Record', color: '#92400e', bg: '#fef3c7' };
  if (score >= 20) return { label: 'Conservative', color: '#b91c1c', bg: '#fee2e2' };
  return { label: 'Very Conservative', color: '#7f1d1d', bg: '#fecaca' };
}

function ACLUPAScorecard({
  score,
  stats,
  session,
}: {
  readonly score: PAChamberMemberScore;
  readonly stats: PAChamberScorecardStats | null | undefined;
  readonly session: string | null | undefined;
}) {
  const band = acluBand(score.score);
  const partyAvg = score.party === 'R' ? stats?.avg_rep_score : stats?.avg_dem_score;
  return (
    <div className="card p-8">
      <h2 className="text-heading-3 mb-1">ACLU-PA Scorecard</h2>
      <p className="text-caption text-primary-400 mb-6">
        {session ?? '2025-2026'} session · civil liberties voting record ·{' '}
        <a href="https://aclupalegislativescorecard.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">Source ↗</a>
      </p>
      <div className="flex flex-col items-center py-6 mb-6 rounded-xl" style={{ background: band.bg }}>
        <div className="text-6xl font-bold mb-2" style={{ color: band.color }}>{score.score}%</div>
        <div className="text-body-sm font-semibold" style={{ color: band.color }}>{band.label}</div>
      </div>
      <div className="mb-6">
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full" style={{ width: `${score.score}%`, background: band.color }} />
        </div>
        <div className="flex justify-between mt-1 text-caption text-primary-400">
          <span>Conservative</span>
          <span>Progressive</span>
        </div>
      </div>
      {stats && (
        <div className="space-y-2">
          {[
            { label: 'This Member', value: `${score.score}%`, accent: false },
            { label: `${score.party === 'R' ? 'Republican' : 'Democrat'} Avg`, value: `${partyAvg?.toFixed(0) ?? '—'}%`, accent: true },
            { label: 'House Average', value: `${stats.avg_score.toFixed(0)}%`, accent: false },
          ].map(({ label, value, accent }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5 rounded-xl" style={{ border: '1px solid var(--border)', background: 'var(--surface-canvas)' }}>
              <span className="text-caption text-primary-500">{label}</span>
              <span className="text-body-sm font-bold" style={{ color: accent ? (score.party === 'R' ? '#dc2626' : '#1d4ed8') : 'var(--primary-950)' }}>{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SECTION_DEFS = [
  { id: 'analysis',  label: 'Analysis',      icon: '◎' },
  { id: 'voting',    label: 'Voting Record',  icon: '⊞' },
  { id: 'news',      label: 'News & Press',   icon: '⊡' },
  { id: 'funding',   label: 'Funding',        icon: '$' },
  { id: 'contact',   label: 'Contact',        icon: '☎' },
  { id: 'biography', label: 'Biography',      icon: '◷' },
  { id: 'committees',label: 'Committees',     icon: '⊕' },
  { id: 'district',  label: 'District',       icon: '◈' },
] as const;

type SectionId = (typeof SECTION_DEFS)[number]['id'];

function SectionCard({ children }: { readonly children: React.ReactNode }) {
  return <div className="card p-8">{children}</div>;
}

function SectionHeading({ title, subtitle }: { readonly title: string; readonly subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-heading-3">{title}</h2>
      {subtitle && <p className="text-caption text-primary-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function StatBox({ label, value }: { readonly label: string; readonly value: string | number }) {
  return (
    <div className="rounded-xl p-3 text-center" style={{ border: '1px solid var(--border)', background: 'var(--surface-canvas)' }}>
      <div className="text-xl font-bold text-primary-950">{value}</div>
      <div className="text-caption text-primary-400">{label}</div>
    </div>
  );
}

export default function ProfileTabs({
  evidenceItems,
  contributions,
  principleScoresSection,
  methodologySection,
  politician,
  contactInfo,
  districtHistory,
  billStatusMap = {},
  candidateResults,
  voterRegistration,
  voterRegAsOf,
  pachamberScore,
  pachamberStats,
  pachamberSession,
  aclupaScore,
  aclupaStats,
  aclupaSession,
}: Props) {
  const [active, setActive] = useState<SectionId>('analysis');
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const principleFilter = searchParams.get('principle');

  useEffect(() => {
    if (principleFilter) setActive('analysis');
  }, [principleFilter]);

  const floorVotes = useMemo(
    () => evidenceItems.filter((e) => e.evidence_type === 'floor_vote'),
    [evidenceItems]
  );
  const newsItems = useMemo(
    () => evidenceItems.filter((e) => e.evidence_type === 'press_release' || e.evidence_type === 'social_media'),
    [evidenceItems]
  );

  const yeaCount = floorVotes.filter((v) => v.vote_position === 'yea').length;
  const nayCount = floorVotes.filter((v) => v.vote_position === 'nay').length;
  const absentCount = floorVotes.filter(
    (v) => v.vote_position === 'absent' || v.vote_position === 'not_voting'
  ).length;
  const totalCast = yeaCount + nayCount + absentCount;

  // Build visible sections based on available data
  const visibleSections = SECTION_DEFS.filter((s) => {
    if (s.id === 'voting') return floorVotes.length > 0;
    if (s.id === 'news') return newsItems.length > 0;
    if (s.id === 'funding') return contributions.length > 0;
    if (s.id === 'biography')
      return (contactInfo?.occupation?.length ?? 0) > 0 || (contactInfo?.education?.length ?? 0) > 0;
    if (s.id === 'committees') return (contactInfo?.committeeAssignments?.length ?? 0) > 0;
    return true;
  });

  // Ensure active is always a visible section
  const activeIsVisible = visibleSections.some((s) => s.id === active);
  const effectiveActive = activeIsVisible ? active : 'analysis';

  function historyYeaBar(year: { dem_votes: number; rep_votes: number; other_votes: number }) {
    const total = year.dem_votes + year.rep_votes + year.other_votes;
    if (total === 0) return null;
    const rPct = Math.round((year.rep_votes / total) * 100);
    const dPct = Math.round((year.dem_votes / total) * 100);
    return { rPct, dPct, total };
  }

  return (
    <div className="flex gap-0">
      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <nav
        className="hidden md:flex flex-col flex-shrink-0 sticky top-24 self-start"
        style={{ width: '200px', minWidth: '200px', marginRight: '28px', maxHeight: 'calc(100vh - 8rem)', overflowY: 'auto' }}
      >
        {visibleSections.map((section) => {
          const isActive = section.id === effectiveActive;
          return (
            <button
              key={section.id}
              onClick={() => setActive(section.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors w-full"
              style={{
                borderLeft: isActive ? '3px solid #c9a84c' : '3px solid transparent',
                background: isActive ? 'rgba(201,168,76,0.07)' : 'transparent',
                color: isActive ? '#0a1628' : 'var(--primary-400)',
                fontWeight: isActive ? 600 : 500,
              }}
            >
              <span className="text-caption w-4 text-center flex-shrink-0" style={{ color: isActive ? '#c9a84c' : 'currentColor' }}>
                {section.icon}
              </span>
              <span className="text-body-sm leading-tight">{section.label}</span>
              {section.id === 'funding' && contributions.length > 0 && (
                <span
                  className="ml-auto text-caption rounded-full px-1.5 py-0.5 flex-shrink-0"
                  style={{ background: '#c9a84c', color: 'white', fontSize: '10px' }}
                >
                  {contributions.length}
                </span>
              )}
              {section.id === 'voting' && floorVotes.length > 0 && (
                <span
                  className="ml-auto text-caption rounded-full px-1.5 py-0.5 flex-shrink-0"
                  style={{ background: 'var(--surface-canvas)', color: 'var(--primary-400)', fontSize: '10px', border: '1px solid var(--border)' }}
                >
                  {floorVotes.length}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Mobile tab row ────────────────────────────────────────── */}
      <div className="md:hidden w-full mb-6">
        <div
          className="flex gap-1 p-1 rounded-xl overflow-x-auto"
          style={{ background: 'var(--surface-canvas)' }}
        >
          {visibleSections.map((section) => {
            const isActive = section.id === effectiveActive;
            return (
              <button
                key={section.id}
                onClick={() => setActive(section.id)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-caption font-semibold whitespace-nowrap transition-all"
                style={{
                  background: isActive ? 'white' : 'transparent',
                  color: isActive ? '#0a1628' : 'var(--primary-400)',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {/* ── Analysis ── */}
        {effectiveActive === 'analysis' && (
          <div className="space-y-8">
            {(pachamberScore ?? aclupaScore) ? (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
                <div className="xl:col-span-2">{principleScoresSection}</div>
                <div className="space-y-6">
                  {pachamberScore && (
                    <PAChamberScorecard score={pachamberScore} stats={pachamberStats} session={pachamberSession} />
                  )}
                  {aclupaScore && (
                    <ACLUPAScorecard score={aclupaScore} stats={aclupaStats} session={aclupaSession} />
                  )}
                </div>
              </div>
            ) : principleScoresSection}

            {methodologySection}
            <div id="evidence-trail" className="card p-8" style={{ scrollMarginTop: '2rem' }}>
              <SectionHeading
                title="Evidence Trail"
                subtitle="Every score is traceable to the specific evidence items below, organized by source type. Click any folder to expand it."
              />
              {principleFilter && (
                <div
                  className="flex items-center justify-between mb-4 px-4 py-2.5 rounded-lg"
                  style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)' }}
                >
                  <p className="text-body-sm font-medium text-primary-800">
                    Filtered to evidence tagged{' '}
                    <strong>{PA_CHAMBER_PRINCIPLES[principleFilter]?.name ?? principleFilter}</strong>
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

        {/* ── Voting Record ── */}
        {effectiveActive === 'voting' && (
          <div className="space-y-6">
            <SectionCard>
              <SectionHeading
                title="Voting Record"
                subtitle="Floor votes tracked via LegiScan — PA Chamber priority bills and related legislation."
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                <StatBox label="Total Votes" value={totalCast} />
                <StatBox label="Yea" value={yeaCount} />
                <StatBox label="Nay" value={nayCount} />
                <StatBox label="Absent / NV" value={absentCount} />
              </div>
              {totalCast > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-caption text-primary-500">Yea rate</span>
                    <span className="text-caption font-semibold text-primary-950">
                      {Math.round((yeaCount / totalCast) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.round((yeaCount / totalCast) * 100)}%`, background: '#c9a84c' }}
                    />
                  </div>
                </div>
              )}
              <h3 className="text-body-sm font-semibold text-primary-950 mb-3">Recent Votes</h3>
              <div className="space-y-2">
                {floorVotes.slice(0, 20).map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl"
                    style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      {v.source_url ? (
                        <a href={v.source_url} target="_blank" rel="noopener noreferrer" className="text-body-sm text-primary-800 hover:underline truncate block">
                          {v.bill_title ?? v.source_text ?? 'Floor vote'}
                        </a>
                      ) : (
                        <span className="text-body-sm text-primary-800 truncate block">
                          {v.bill_title ?? v.source_text ?? 'Floor vote'}
                        </span>
                      )}
                      {v.source_date && (
                        <span className="text-caption text-primary-400">
                          {new Date(v.source_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <span
                      className="flex-shrink-0 text-caption font-bold rounded-full px-3 py-1 uppercase"
                      style={voteStyle(v.vote_position)}
                    >
                      {v.vote_position ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-caption text-primary-400 mt-4">
                Showing {Math.min(20, floorVotes.length)} of {floorVotes.length} tracked votes.{' '}
                <a href="https://www.legis.state.pa.us/cfdocs/legis/RC/Public/rc_view_date.cfm?rc_body=H" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">Full House roll call records ↗</a>
              </p>
            </SectionCard>

            <SponsoredBills
              items={evidenceItems.filter((e) => e.evidence_type === 'bill_sponsorship' || e.evidence_type === 'bill_cosponsorship')}
              billStatusMap={billStatusMap}
            />
          </div>
        )}

        {/* ── News & Press ── */}
        {effectiveActive === 'news' && (
          <div className="space-y-6">
            <SectionCard>
              <SectionHeading
                title="News & Press"
                subtitle="Press releases and public statements from news sources and official channels."
              />
              <div className="space-y-3">
                {newsItems.map((item) => {
                  const title = item.source_text?.split('\n')[0]?.slice(0, 120) ?? 'Article';
                  const isVideo = !!(item.source_url?.includes('youtube.com') || item.source_url?.includes('youtu.be'));
                  return (
                    <a
                      key={item.id}
                      href={item.source_url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-4 px-4 py-3 rounded-xl transition-colors hover:bg-stone-50"
                      style={{ border: '1px solid var(--border)' }}
                    >
                      <span className="flex-shrink-0 mt-0.5 text-primary-300 text-caption">
                        {newsIcon(isVideo, item.evidence_type)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm text-primary-950 leading-snug line-clamp-2">{title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {item.source_date && (
                            <span className="text-caption text-primary-400">
                              {new Date(item.source_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          {item.source_url && (
                            <span className="text-caption text-primary-300">·</span>
                          )}
                          {item.source_url && (
                            <span className="text-caption text-primary-400 truncate">
                              {new URL(item.source_url).hostname.replace('www.', '')}
                            </span>
                          )}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── Funding ── */}
        {effectiveActive === 'funding' && (
          <FundingTab contributions={contributions} />
        )}

        {/* ── Contact ── */}
        {effectiveActive === 'contact' && (
          <ContactTab politician={politician} contactInfo={contactInfo} />
        )}

        {/* ── Biography ── */}
        {effectiveActive === 'biography' && (
          <div className="space-y-6">
            <SectionCard>
              <SectionHeading title="Biography" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {(contactInfo?.occupation?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-body-sm font-semibold text-primary-950 mb-3">Occupation</h3>
                    <ul className="space-y-1.5 list-disc list-inside">
                      {contactInfo!.occupation!.map((line) => (
                        <li key={line} className="text-body-sm text-primary-700">{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(contactInfo?.education?.length ?? 0) > 0 && (
                  <div>
                    <h3 className="text-body-sm font-semibold text-primary-950 mb-3">Education</h3>
                    <ul className="space-y-1.5 list-disc list-inside">
                      {contactInfo!.education!.map((line) => (
                        <li key={line} className="text-body-sm text-primary-700">{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {contactInfo?.legislativeActivity && (
                <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-body-sm font-semibold text-primary-950">Legislative Activity</h3>
                    <span className="text-caption text-primary-400">{contactInfo.legislativeActivity.sessionLabel}</span>
                  </div>
                  <p className="text-caption text-primary-400 mb-4">Bills and resolutions sponsored this session — not limited to PA Chamber priority legislation.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Bills Sponsored', value: contactInfo.legislativeActivity.billsSponsored },
                      { label: 'Bills Co-Sponsored', value: contactInfo.legislativeActivity.billsCoSponsored },
                      { label: 'Resolutions Sponsored', value: contactInfo.legislativeActivity.resolutionsSponsored },
                      { label: 'Resolutions Co-Sponsored', value: contactInfo.legislativeActivity.resolutionsCoSponsored },
                    ].map((stat) => (
                      <StatBox key={stat.label} label={stat.label} value={stat.value} />
                    ))}
                  </div>
                </div>
              )}
              {contactInfo?.source_url && (
                <p className="text-caption text-primary-400 mt-6">
                  <a href={contactInfo.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">Source: palegis.us bio page ↗</a>
                </p>
              )}
            </SectionCard>
          </div>
        )}

        {/* ── Committees ── */}
        {effectiveActive === 'committees' && (
          <div className="space-y-6">
            <SectionCard>
              <SectionHeading
                title="Committee Assignments"
                subtitle={`${contactInfo?.committeeAssignments.length ?? 0} committee${(contactInfo?.committeeAssignments.length ?? 0) === 1 ? '' : 's'}, per the official PA House committee roster.`}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {contactInfo?.committeeAssignments.map((c) => (
                  <a
                    key={c.committeeUrl}
                    href={c.committeeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-stone-50"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    <span className="text-body-sm font-medium text-primary-950">{c.committee}</span>
                    <span
                      className="text-caption font-semibold rounded-full px-2 py-0.5 ml-3 flex-shrink-0"
                      style={
                        c.role === 'Member'
                          ? { color: 'var(--primary-400)', background: 'var(--surface-canvas)' }
                          : { color: '#92400e', background: '#fef3c7' }
                      }
                    >
                      {c.role}
                    </span>
                  </a>
                ))}
              </div>
              <p className="text-caption text-primary-400 mt-4">
                <a href="https://www.palegis.us/house/members" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">
                  Source: palegis.us official House roster ↗
                </a>
              </p>
            </SectionCard>
          </div>
        )}

        {/* ── District ── */}
        {effectiveActive === 'district' && (
          <div className="space-y-6">
            <SectionCard>
              <SectionHeading
                title={`District ${politician.district ?? '—'}`}
                subtitle={politician.county ? `${politician.county} County and surrounding area` : undefined}
              />

              {/* District identity */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
                {politician.district && <StatBox label="District" value={`HD-${politician.district}`} />}
                {politician.county && <StatBox label="County" value={`${politician.county} County`} />}
                {politician.party && <StatBox label="Current Party" value={partyLabel(politician.party)} />}
              </div>

              {/* Election history */}
              {districtHistory ? (
                <>
                  <h3 className="text-body-sm font-semibold text-primary-950 mb-3">Election History</h3>
                  <div className="space-y-4">
                    {Object.entries(districtHistory)
                      .sort(([a], [b]) => Number(b) - Number(a))
                      .map(([year, result]) => {
                        const bar = historyYeaBar(result);
                        const total = result.dem_votes + result.rep_votes + result.other_votes;
                        return (
                          <div key={year}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-body-sm font-semibold text-primary-950">{year}</span>
                              <span
                                className="text-caption font-semibold rounded-full px-2 py-0.5"
                                style={winnerStyle(result.winner_party)}
                              >
                                {winnerLabel(result.winner_party)}
                              </span>
                            </div>
                            {bar && (
                              <>
                                <div className="h-5 rounded-full overflow-hidden flex" style={{ background: '#dbeafe' }}>
                                  <div
                                    className="h-full transition-all"
                                    style={{ width: `${bar.rPct}%`, background: '#dc2626' }}
                                    title={`R: ${bar.rPct}%`}
                                  />
                                </div>
                                <div className="flex justify-between mt-1">
                                  <span className="text-caption text-red-600">R {bar.rPct}% · {result.rep_votes.toLocaleString()}</span>
                                  <span className="text-caption text-blue-600">D {bar.dPct}% · {result.dem_votes.toLocaleString()}</span>
                                </div>
                                {result.other_votes > 0 && (
                                  <span className="text-caption text-primary-400">Other: {result.other_votes.toLocaleString()} ({Math.round((result.other_votes / total) * 100)}%)</span>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  <p className="text-caption text-primary-400 mt-6">
                    Source: <a href="https://github.com/openelections/openelections-data-pa" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">OpenElections Pennsylvania ↗</a>
                  </p>
                </>
              ) : (
                <div className="rounded-xl px-4 py-8 text-center" style={{ background: 'var(--surface-canvas)', border: '1px solid var(--border)' }}>
                  <p className="text-body-sm text-primary-400">Historical election data not available for this district.</p>
                </div>
              )}

              {/* Links */}
              <div className="mt-8 pt-8 flex flex-wrap gap-3" style={{ borderTop: '1px solid var(--border)' }}>
                {politician.district && (
                  <a href={`/overview?district=${politician.district}`} className="btn-secondary text-caption py-2 px-4">
                    View on Map ↗
                  </a>
                )}
                <a
                  href={`https://www.legis.state.pa.us/cfdocs/legis/home/findyourrep.cfm`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-caption py-2 px-4"
                >
                  PA General Assembly ↗
                </a>
              </div>
            </SectionCard>

            {/* Voter Registration */}
            {voterRegistration && (
              <SectionCard>
                <SectionHeading
                  title="Voter Registration"
                  subtitle={voterRegAsOf ? `Registered voters as of ${voterRegAsOf}` : 'Registered voters by party affiliation'}
                />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                  <StatBox label="Total Registered" value={voterRegistration.total.toLocaleString()} />
                  <StatBox label="Republican" value={voterRegistration.republican.toLocaleString()} />
                  <StatBox label="Democrat" value={voterRegistration.democrat.toLocaleString()} />
                  <StatBox label="Other / No Party" value={voterRegistration.other.toLocaleString()} />
                </div>
                {voterRegistration.total > 0 && (
                  <>
                    <div className="h-5 rounded-full overflow-hidden flex">
                      <div style={{ width: `${Math.round((voterRegistration.republican / voterRegistration.total) * 100)}%`, background: '#dc2626' }} className="h-full" />
                      <div style={{ width: `${Math.round((voterRegistration.democrat / voterRegistration.total) * 100)}%`, background: '#1d4ed8' }} className="h-full" />
                      <div style={{ flex: 1, background: '#d1d5db' }} className="h-full" />
                    </div>
                    <div className="flex gap-4 mt-2 text-caption">
                      <span className="text-red-600">R {Math.round((voterRegistration.republican / voterRegistration.total) * 100)}%</span>
                      <span className="text-blue-600">D {Math.round((voterRegistration.democrat / voterRegistration.total) * 100)}%</span>
                      <span className="text-primary-400">Other {Math.round((voterRegistration.other / voterRegistration.total) * 100)}%</span>
                    </div>
                  </>
                )}
                <p className="text-caption text-primary-400 mt-4">
                  Source: <a href="https://www.vote.pa.gov/About-Elections/Pages/Voter-Registration-Statistics.aspx" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">PA Department of State ↗</a>
                </p>
              </SectionCard>
            )}

            {/* Candidate-Level Results */}
            {candidateResults && Object.keys(candidateResults).length > 0 && (
              <SectionCard>
                <SectionHeading
                  title="Election Results by Candidate"
                  subtitle="Actual vote totals and candidates on the ballot in recent general elections."
                />
                <div className="space-y-6">
                  {Object.entries(candidateResults)
                    .sort(([a], [b]) => Number(b) - Number(a))
                    .map(([year, candidates]) => (
                      <div key={year}>
                        <h3 className="text-body-sm font-semibold text-primary-950 mb-3">{year} General Election</h3>
                        <div className="space-y-2">
                          {candidates.map((c, i) => (
                            <div
                              key={`${year}-${c.candidate}-${i}`}
                              className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                              style={{ border: '1px solid var(--border)', background: 'var(--surface-canvas)' }}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                {i === 0 && (
                                  <span className="text-caption font-semibold rounded-full px-2 py-0.5 flex-shrink-0" style={{ background: '#dcfce7', color: '#15803d' }}>
                                    Winner
                                  </span>
                                )}
                                <span className="text-body-sm font-medium text-primary-950 truncate">{c.candidate}</span>
                                <span
                                  className="text-caption font-semibold rounded-full px-2 py-0.5 flex-shrink-0"
                                  style={candidatePartyStyle(c.party)}
                                >
                                  {c.party}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-right flex-shrink-0">
                                <span className="text-body-sm font-semibold text-primary-950">{c.votes.toLocaleString()}</span>
                                <span className="text-caption text-primary-400 w-10">{c.pct.toFixed(1)}%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
                <p className="text-caption text-primary-400 mt-4">
                  Source: <a href="https://github.com/openelections/openelections-data-pa" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary-700">OpenElections Pennsylvania ↗</a>
                </p>
              </SectionCard>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
