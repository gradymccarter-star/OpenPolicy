'use client';

import { useState } from 'react';

interface Claim {
  id: string;
  claim_text: string;
  stance: string;
  strength: string;
  principle: string;
}

interface EvidenceItem {
  id: string;
  evidence_type: string;
  source_text?: string | null;
  source_url?: string | null;
  source_date?: string | null;
  vote_position?: string | null;
  bill_title?: string | null;
  tagged_principles?: string[] | null;
  claims?: Claim[];
}

interface FolderConfig {
  label: string;
  icon: string;
  description: string;
}

const FOLDERS: Record<string, FolderConfig> = {
  floor_vote: { label: 'Floor Votes', icon: '🗳', description: 'Recorded votes on House bills' },
  bill_sponsorship: { label: 'Sponsored Bills', icon: '📋', description: 'Bills introduced as primary sponsor' },
  bill_cosponsorship: { label: 'Co-Sponsored Bills', icon: '📄', description: 'Bills co-sponsored with other members' },
  news_article: { label: 'News Coverage', icon: '📰', description: 'Press coverage and media mentions' },
  social_media: { label: 'Social Media & Video', icon: '💬', description: 'Posts, interviews, and YouTube coverage' },
  committee_statement: { label: 'Committee Statements', icon: '🎙', description: 'Remarks made during committee hearings' },
  floor_speech: { label: 'Floor Speeches', icon: '📢', description: 'Speeches delivered on the House floor' },
  press_release: { label: 'News Coverage', icon: '📰', description: 'Newspaper articles, media mentions, and press releases' },
};

const VOTE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  yea: { bg: '#dcfce7', color: '#166534', label: 'YEA' },
  nay: { bg: '#fee2e2', color: '#991b1b', label: 'NAY' },
  abstain: { bg: '#fef9c3', color: '#854d0e', label: 'ABSTAIN' },
  absent: { bg: '#f3f4f6', color: '#6b7280', label: 'ABSENT' },
};

const STANCE_STYLES: Record<string, { bg: string; color: string }> = {
  support: { bg: '#0a1628', color: '#fff' },
  oppose: { bg: '#fee2e2', color: '#991b1b' },
  conditional: { bg: '#fef9c3', color: '#854d0e' },
  neutral: { bg: '#f3f4f6', color: '#6b7280' },
};

function formatDate(d?: string | null) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function PrinciplePill({ p }: { readonly p: string }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-caption font-semibold"
      style={{ background: 'rgba(201,168,76,0.12)', color: '#b8922e', fontSize: '10px' }}
    >
      {p}
    </span>
  );
}

function FloorVoteRow({ item }: { readonly item: EvidenceItem }) {
  const [open, setOpen] = useState(false);
  const vs = VOTE_STYLES[item.vote_position?.toLowerCase() ?? ''] ?? VOTE_STYLES.absent;

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: '#f1f5f9' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex items-center gap-3 py-3 px-4 hover:bg-slate-50 transition-colors"
      >
        <span
          className="flex-shrink-0 px-2 py-0.5 rounded font-bold text-caption"
          style={{ background: vs.bg, color: vs.color, minWidth: 46, textAlign: 'center' }}
        >
          {vs.label}
        </span>
        <span className="flex-1 text-body-sm text-primary-800 font-medium line-clamp-1">
          {item.bill_title || 'Bill vote'}
        </span>
        <span className="text-caption text-primary-400 flex-shrink-0">{formatDate(item.source_date)}</span>
        {(item.tagged_principles?.length ?? 0) > 0 && (
          <div className="flex gap-1 flex-shrink-0">
            {item.tagged_principles?.map((p) => <PrinciplePill key={p} p={p} />)}
          </div>
        )}
        <svg
          className="flex-shrink-0 w-4 h-4 text-primary-300 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 bg-slate-50">
          {item.claims && item.claims.length > 0 && (
            <div className="space-y-1.5">
              {item.claims.map((c) => {
                const ss = STANCE_STYLES[c.stance] ?? STANCE_STYLES.neutral;
                return (
                  <div key={c.id} className="flex items-start gap-2 text-caption rounded p-2 bg-white" style={{ border: '1px solid #e2e8f0' }}>
                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded font-semibold" style={{ background: ss.bg, color: ss.color, fontSize: 10 }}>
                      {c.stance} · {c.strength}
                    </span>
                    <span className="text-primary-600">&ldquo;{c.claim_text}&rdquo;</span>
                    <span className="flex-shrink-0 text-primary-300">{c.principle}</span>
                  </div>
                );
              })}
            </div>
          )}
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer"
              className="text-caption text-primary-400 hover:text-primary-700 underline underline-offset-2 inline-block transition-colors">
              View source &rarr;
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function SponsorshipRow({ item }: { readonly item: EvidenceItem }) {
  const [open, setOpen] = useState(false);
  const hasClaims = (item.claims?.length ?? 0) > 0;

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: '#f1f5f9' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex items-center gap-3 py-3 px-4 hover:bg-slate-50 transition-colors"
      >
        <span className="flex-1 text-body-sm text-primary-800 font-medium line-clamp-1">
          {item.bill_title || item.source_text?.substring(0, 80) || 'Bill'}
        </span>
        <span className="text-caption text-primary-400 flex-shrink-0">{formatDate(item.source_date)}</span>
        {(item.tagged_principles?.length ?? 0) > 0 && (
          <div className="flex gap-1 flex-shrink-0">
            {item.tagged_principles?.map((p) => <PrinciplePill key={p} p={p} />)}
          </div>
        )}
        {(hasClaims || item.source_url) && (
          <svg className="flex-shrink-0 w-4 h-4 text-primary-300 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 bg-slate-50">
          {item.claims?.map((c) => {
            const ss = STANCE_STYLES[c.stance] ?? STANCE_STYLES.neutral;
            return (
              <div key={c.id} className="flex items-start gap-2 text-caption rounded p-2 bg-white" style={{ border: '1px solid #e2e8f0' }}>
                <span className="flex-shrink-0 px-1.5 py-0.5 rounded font-semibold" style={{ background: ss.bg, color: ss.color, fontSize: 10 }}>
                  {c.stance} · {c.strength}
                </span>
                <span className="text-primary-600">&ldquo;{c.claim_text}&rdquo;</span>
              </div>
            );
          })}
          {item.source_url && (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer"
              className="text-caption text-primary-400 hover:text-primary-700 underline underline-offset-2 inline-block transition-colors">
              View source &rarr;
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ClaimsBlock({ claims }: { readonly claims?: Claim[] }) {
  if (!claims?.length) return null;
  return (
    <div className="space-y-1.5">
      {claims.map((c) => {
        const ss = STANCE_STYLES[c.stance] ?? STANCE_STYLES.neutral;
        return (
          <div key={c.id} className="flex items-start gap-2 text-caption rounded p-2 bg-white" style={{ border: '1px solid #e2e8f0' }}>
            <span className="flex-shrink-0 px-1.5 py-0.5 rounded font-semibold" style={{ background: ss.bg, color: ss.color, fontSize: 10 }}>
              {c.stance} · {c.strength}
            </span>
            <span className="text-primary-600">&ldquo;{c.claim_text}&rdquo;</span>
            <span className="flex-shrink-0 text-primary-300">{c.principle}</span>
          </div>
        );
      })}
    </div>
  );
}

function SourceLink({ url, label = 'View source' }: { readonly url?: string | null; readonly label?: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="text-caption text-primary-400 hover:text-primary-700 underline underline-offset-2 inline-block transition-colors">
      {label} &rarr;
    </a>
  );
}

function extractYouTubeId(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get('v');
  } catch {
    return null;
  }
}

function YouTubeRow({ item }: { readonly item: EvidenceItem }) {
  const [open, setOpen] = useState(false);
  const videoId = extractYouTubeId(item.source_url);
  const lines = (item.source_text || '').split('\n\n');
  const title = lines[0] || 'YouTube video';
  const description = lines.slice(1).join('\n\n').trim();
  const hasClaims = (item.claims?.length ?? 0) > 0;

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: '#f1f5f9' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex items-center gap-3 py-3 px-4 hover:bg-slate-50 transition-colors"
      >
        {/* Thumbnail */}
        <div className="flex-shrink-0 relative rounded overflow-hidden" style={{ width: 96, height: 54, background: '#000' }}>
          {videoId ? (
            <img
              src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
              alt=""
              className="w-full h-full object-cover opacity-90"
            />
          ) : (
            <div className="w-full h-full" style={{ background: '#1a1a2e' }} />
          )}
          {/* Play badge */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full flex items-center justify-center" style={{ background: 'rgba(255,0,0,0.85)', width: 22, height: 22 }}>
              <svg viewBox="0 0 24 24" fill="white" width={10} height={10} style={{ marginLeft: 2 }}>
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-body-sm text-primary-800 font-medium line-clamp-2 leading-snug">{title}</p>
        </div>
        <span className="text-caption text-primary-400 flex-shrink-0">{formatDate(item.source_date)}</span>
        {(hasClaims || description) && (
          <svg className="flex-shrink-0 w-4 h-4 text-primary-300 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 bg-slate-50">
          {description && (
            <p className="text-caption text-primary-500 leading-relaxed">{description}</p>
          )}
          <ClaimsBlock claims={item.claims} />
          <SourceLink url={item.source_url} label="Watch on YouTube" />
        </div>
      )}
    </div>
  );
}

function BlueskyRow({ item }: { readonly item: EvidenceItem }) {
  const [open, setOpen] = useState(false);
  const text = item.source_text || '';
  const hasClaims = (item.claims?.length ?? 0) > 0;

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: '#f1f5f9' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex items-start gap-3 py-3 px-4 hover:bg-slate-50 transition-colors"
      >
        <span className="flex-shrink-0 text-base leading-none mt-0.5" style={{ color: '#0085ff' }}>🦋</span>
        <div className="flex-1 min-w-0">
          <p className="text-body-sm text-primary-800 line-clamp-2 leading-snug">{text}</p>
        </div>
        <span className="text-caption text-primary-400 flex-shrink-0 pt-0.5">{formatDate(item.source_date)}</span>
        {(hasClaims || item.source_url) && (
          <svg className="flex-shrink-0 w-4 h-4 text-primary-300 transition-transform mt-0.5"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 bg-slate-50">
          {text.length > 120 && (
            <p className="text-caption text-primary-600 leading-relaxed">{text}</p>
          )}
          <ClaimsBlock claims={item.claims} />
          <SourceLink url={item.source_url} label="View on Bluesky" />
        </div>
      )}
    </div>
  );
}

function TextRow({ item }: { readonly item: EvidenceItem }) {
  const [open, setOpen] = useState(false);
  const text = item.source_text || item.bill_title || '';
  const hasClaims = (item.claims?.length ?? 0) > 0;

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: '#f1f5f9' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex items-start gap-3 py-3 px-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-body-sm text-primary-800 font-medium line-clamp-2">{text}</p>
        </div>
        <span className="text-caption text-primary-400 flex-shrink-0 pt-0.5">{formatDate(item.source_date)}</span>
        {(hasClaims || item.source_url) && (
          <svg className="flex-shrink-0 w-4 h-4 text-primary-300 transition-transform mt-0.5"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2 bg-slate-50">
          {text.length > 120 && (
            <p className="text-caption text-primary-600 leading-relaxed">{text}</p>
          )}
          <ClaimsBlock claims={item.claims} />
          <SourceLink url={item.source_url} />
        </div>
      )}
    </div>
  );
}

function EvidenceFolder({
  type,
  items,
  defaultOpen = false,
}: {
  readonly type: string;
  readonly items: EvidenceItem[];
  readonly defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const config = FOLDERS[type] ?? { label: type, icon: '📌', description: '' };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 transition-colors hover:bg-slate-50"
        style={{ background: open ? '#f8fafc' : '#fff' }}
      >
        <span className="text-xl leading-none">{config.icon}</span>
        <div className="flex-1 text-left">
          <p className="font-semibold text-primary-950 text-body-sm">{config.label}</p>
          {!open && config.description && (
            <p className="text-caption text-primary-400">{config.description}</p>
          )}
        </div>
        <span
          className="text-caption font-bold px-2.5 py-0.5 rounded-full"
          style={{ background: '#0a1628', color: '#fff', minWidth: 28, textAlign: 'center' }}
        >
          {items.length}
        </span>
        <svg
          className="w-5 h-5 text-primary-300 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #e2e8f0' }}>
          {items.map((item) => {
            if (type === 'floor_vote') return <FloorVoteRow key={item.id} item={item} />;
            if (type === 'bill_sponsorship' || type === 'bill_cosponsorship') return <SponsorshipRow key={item.id} item={item} />;
            if (type === 'social_media') {
              if (item.source_url?.includes('youtube.com')) return <YouTubeRow key={item.id} item={item} />;
              if (item.source_url?.includes('bsky.app')) return <BlueskyRow key={item.id} item={item} />;
            }
            return <TextRow key={item.id} item={item} />;
          })}
        </div>
      )}
    </div>
  );
}

const FOLDER_ORDER = [
  'floor_vote',
  'bill_sponsorship',
  'bill_cosponsorship',
  'committee_statement',
  'floor_speech',
  'press_release',
  'news_article',
  'social_media',
];

export default function EvidenceAccordion({ items }: { readonly items: EvidenceItem[] }) {
  const groups: Record<string, EvidenceItem[]> = {};
  for (const item of items) {
    const type = item.evidence_type;
    if (!groups[type]) groups[type] = [];
    groups[type].push(item);
  }

  const orderedTypes = [
    ...FOLDER_ORDER.filter((t) => groups[t]),
    ...Object.keys(groups).filter((t) => !FOLDER_ORDER.includes(t)),
  ];

  if (orderedTypes.length === 0) {
    return (
      <p className="text-primary-400 text-center py-10">
        No evidence items yet. Run the pipeline to collect evidence.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {orderedTypes.map((type) => (
        <EvidenceFolder
          key={type}
          type={type}
          items={groups[type]}
          defaultOpen={false}
        />
      ))}
    </div>
  );
}
