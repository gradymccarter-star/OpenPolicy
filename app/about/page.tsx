import Image from 'next/image';
import Link from 'next/link';
import { PA_CHAMBER_PRINCIPLES } from '@/lib/utils/constants';

const TEAM_MEMBERS = [
  {
    name: 'Juhyun Nam',
    role: 'Co-Founder',
    photo: '/images/team/founder-2.jpg',
    linkedin: 'https://www.linkedin.com/in/juhyun-nam-4ba16b326/',
  },
  {
    name: 'Grady McCarter',
    role: 'Co-Founder',
    photo: '/images/team/founder-1.jpg',
    linkedin: 'https://www.linkedin.com/in/grady-mccarter-988125266/',
  },
];

const PRINCIPLE_COLORS = [
  '#c9a84c','#3b82f6','#10b981','#f59e0b','#8b5cf6',
  '#ef4444','#06b6d4','#f97316','#ec4899',
];

const HOW_IT_WORKS = [
  {
    step: '1',
    title: 'Evidence Collection',
    body: 'Floor votes, bill sponsorships, committee actions, press releases, and public statements are gathered from official PA House records, LegiScan, and public sources.',
  },
  {
    step: '2',
    title: 'AI Classification',
    body: 'Claude AI reads each evidence item, determines which of the 9 PA Chamber priorities it touches, whether the action supports or opposes that priority, and extracts the key claim.',
  },
  {
    step: '3',
    title: 'Deterministic Scoring',
    body: 'Scores are calculated with transparent, fixed math — the AI never produces a score directly. Bill sponsorships carry the highest weight; floor votes and co-sponsorships follow. Every score is traceable to a specific source.',
  },
  {
    step: '4',
    title: 'Confidence Weighting',
    body: 'Each candidate gets a confidence percentage based on how much evidence exists. Challengers with no voting record receive lower confidence scores. The final alignment score and confidence are displayed together.',
  },
];

export default function AboutPage() {
  const principleEntries = Object.entries(PA_CHAMBER_PRINCIPLES);

  return (
    <main>
      {/* Hero */}
      <section className="py-14 lg:py-20" style={{ background: '#0a1628' }}>
        <div className="container-page">
          <p className="text-caption font-semibold uppercase tracking-widest mb-3" style={{ color: '#c9a84c' }}>
            PA Chamber of Business & Industry · 2026
          </p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            About This Tool
          </h1>
          <p className="text-body text-white/50 max-w-2xl leading-relaxed">
            An AI-powered endorsement research platform built to help the PA Chamber of Business & Industry
            evaluate 2026 Pennsylvania House candidates against the Chamber&apos;s nine core business priorities.
          </p>
        </div>
      </section>

      <div className="container-page py-12 space-y-8">

        {/* What this is */}
        <section className="card p-8">
          <h2 className="text-heading-3 mb-3">What This Is</h2>
          <p className="text-body-sm text-primary-500 leading-relaxed mb-3">
            This platform is a pilot endorsement research tool built for the PA Chamber of Business & Industry&apos;s
            2026 PA House election cycle. It scores every active PA House member on their alignment with the
            Chamber&apos;s nine legislative priorities — taxes, permitting, civil justice reform, fiscal responsibility,
            workforce development, energy & environment, labor relations, infrastructure, and health care cost reduction.
          </p>
          <p className="text-body-sm text-primary-500 leading-relaxed">
            Scores are derived from real legislative evidence: votes, bill sponsorships, committee actions,
            public statements, and questionnaire responses. The tool also incorporates campaign finance data
            from FollowTheMoney.org (2020–2024 cycles) to show each candidate&apos;s donor alignment with
            Chamber priorities.
          </p>
        </section>

        {/* How it works */}
        <section className="card p-8">
          <h2 className="text-heading-3 mb-6">How Scores Are Calculated</h2>
          <div className="space-y-5">
            {HOW_IT_WORKS.map(({ step, title, body }) => (
              <div key={step} className="flex gap-5">
                <div
                  className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm"
                  style={{ background: '#0a1628', color: '#c9a84c' }}
                >
                  {step}
                </div>
                <div>
                  <p className="font-semibold text-primary-950 text-body-sm mb-1">{title}</p>
                  <p className="text-body-sm text-primary-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl p-4" style={{ background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)' }}>
            <p className="text-caption text-primary-600 leading-relaxed">
              <strong className="text-primary-950">Score interpretation:</strong> A score of 100% means a candidate&apos;s
              entire legislative record aligns with Chamber priorities. 0% means full opposition. Most incumbents
              fall between 40–80%. Confidence reflects how much evidence exists — low confidence scores (under 40%)
              should be read carefully.
            </p>
          </div>
        </section>

        {/* Scoring criteria — the 9 principles */}
        <section>
          <div className="mb-5">
            <h2 className="text-heading-3 mb-1">The 9 Scoring Dimensions</h2>
            <p className="text-body-sm text-primary-500">
              Derived from the PA Chamber&apos;s 2025 Legislative Agenda. Every score is broken down across these nine priorities.
            </p>
          </div>
          <div className="space-y-3">
            {principleEntries.map(([key, principle], index) => {
              const color = PRINCIPLE_COLORS[index % PRINCIPLE_COLORS.length];
              return (
                <div
                  key={key}
                  className="rounded-xl p-5 bg-white"
                  style={{ border: '1px solid #e5e7eb', borderLeft: `4px solid ${color}` }}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm"
                      style={{ background: color, color: index === 0 ? '#0a1628' : '#fff' }}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-body-sm font-bold text-primary-950">{principle.name}</h3>
                        <span className="text-caption font-bold px-1.5 py-0.5 rounded" style={{ background: `${color}18`, color }}>{key}</span>
                      </div>
                      <p className="text-caption text-primary-500 leading-relaxed">{principle.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4">
            <Link
              href="/principles"
              className="text-body-sm font-medium hover:underline"
              style={{ color: '#c9a84c' }}
            >
              View full scoring criteria with key indicators →
            </Link>
          </div>
        </section>

        {/* Campaign finance */}
        <section className="card p-8">
          <h2 className="text-heading-3 mb-3">Campaign Finance Data</h2>
          <p className="text-body-sm text-primary-500 leading-relaxed mb-3">
            Each candidate profile includes a Funding tab sourced from FollowTheMoney.org, covering the 2020,
            2022, and 2024 PA House election cycles. Every donor organization is classified as Pro-Chamber,
            Anti-Chamber, Neutral, or Unclassified based on its known lobbying positions and advocacy history.
          </p>
          <p className="text-body-sm text-primary-500 leading-relaxed">
            Anti-chamber classifications include labor unions (which typically oppose PA Chamber Priority 7 on labor
            relations) and trial lawyer associations (which oppose Priority 3 on civil justice reform). Pro-chamber
            classifications include business associations, industry groups, and professional societies whose policy
            goals align with the Chamber&apos;s nine priorities. Classifications use a combination of keyword rules
            and AI classification via Claude.
          </p>
          <div className="mt-4">
            <Link href="/funding-intelligence" className="text-body-sm font-medium hover:underline" style={{ color: '#c9a84c' }}>
              View full donor classification database →
            </Link>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="rounded-xl p-6" style={{ background: '#fdf8ee', border: '1px solid rgba(201,168,76,0.3)' }}>
          <h2 className="text-body-sm font-bold text-primary-950 mb-2">Disclaimer</h2>
          <p className="text-caption text-primary-600 leading-relaxed">
            This platform is a pilot research tool for internal use by the PA Chamber of Business & Industry.
            Scores are based on computational analysis of public legislative data and should be used as one input
            among many in endorsement decisions. Always verify key evidence items with primary sources.
            Scores for challengers with limited public records carry lower confidence and should be interpreted accordingly.
          </p>
        </section>
      </div>

      {/* Team */}
      <section className="py-12 lg:py-16" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <div className="text-center mb-10">
            <h2 className="text-heading-2 mb-3">Built By</h2>
            <p className="text-body-sm text-primary-500 max-w-xl mx-auto">
              This tool was designed and built by the SCAI team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {TEAM_MEMBERS.map((member) => (
              <div key={member.name} className="card card-hover p-8 text-center">
                <div className="mb-5">
                  <div className="w-28 h-28 mx-auto rounded-full overflow-hidden relative" style={{ border: '2px solid var(--border)' }}>
                    <Image src={member.photo} alt={member.name} fill className="object-cover" />
                  </div>
                </div>
                <h3 className="text-heading-4 text-primary-950 mb-1">{member.name}</h3>
                <p className="text-body-sm text-primary-500 font-medium mb-4">{member.role}</p>
                <a
                  href={member.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-caption font-medium transition-colors"
                  style={{ background: 'var(--surface-base)', color: 'var(--foreground)' }}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  LinkedIn
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
