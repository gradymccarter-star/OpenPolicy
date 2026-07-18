import Image from 'next/image';
import Link from 'next/link';
import { PA_CHAMBER_PRINCIPLES } from '@/lib/utils/constants';
import ScoringPipeline from '@/components/methodology/ScoringPipeline';

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

export default function AboutPage() {
  const principleEntries = Object.entries(PA_CHAMBER_PRINCIPLES);

  return (
    <main>
      {/* Hero */}
      <section className="py-14 lg:py-20" style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)' }}>
        <div className="container-page">
          <p className="overline">
            PA Chamber of Business & Industry · 2026
          </p>
          <h1 className="text-heading-1 text-primary-950 mt-3 mb-4">
            About This Tool
          </h1>
          <p className="text-body text-primary-500 max-w-2xl leading-relaxed">
            An AI-powered endorsement research platform built to help the PA Chamber of Business & Industry
            evaluate 2026 Pennsylvania House candidates against the Chamber&apos;s nine core business priorities.
          </p>
        </div>
      </section>

      <div className="container-page py-12 space-y-10">

        {/* What this is */}
        <section className="card p-8">
          <p className="overline">Overview</p>
          <h2 className="text-heading-3 mt-3 mb-3">What This Is</h2>
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
          <div className="mt-5 rounded-lg p-4" style={{ background: 'var(--brass-wash)', border: '1px solid var(--rule)' }}>
            <p className="text-caption text-primary-600 leading-relaxed">
              <strong className="text-primary-950">Score interpretation:</strong> A score of 100% means a candidate&apos;s
              entire legislative record aligns with Chamber priorities. 0% means full opposition. Most incumbents
              fall between 40–80%. Confidence reflects how much evidence exists — scores below 40% confidence
              should be read carefully.
            </p>
          </div>
        </section>

        {/* Scoring pipeline */}
        <section>
          <div className="mb-6">
            <p className="overline">Methodology</p>
            <h2 className="text-heading-3 mt-3 mb-1">How Scores Are Calculated</h2>
            <p className="text-body-sm text-primary-500">
              Click any step to see details on how evidence is collected, weighted, and turned into a score.
            </p>
          </div>
          <ScoringPipeline />
        </section>

        {/* The 9 scoring dimensions */}
        <section>
          <div className="mb-6">
            <p className="overline">Scoring Framework</p>
            <h2 className="text-heading-3 mt-3 mb-1">The 9 Scoring Dimensions</h2>
            <p className="text-body-sm text-primary-500">
              Derived from the PA Chamber&apos;s 2025 Legislative Agenda. Every candidate score is broken down across these nine priorities.
            </p>
          </div>

          <div className="space-y-4">
            {principleEntries.map(([key, principle], index) => {
              return (
                <div key={key} className="card p-6">
                  <div className="flex items-start gap-5">
                    <span
                      className="figure flex-shrink-0 text-xl font-semibold pt-0.5"
                      style={{ color: 'var(--brass)' }}
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="text-heading-4">{principle.name}</h3>
                        <span
                          className="figure text-caption font-semibold px-2 py-0.5 rounded-sm"
                          style={{ background: 'var(--brass-wash)', color: 'var(--brass)' }}
                        >
                          {key}
                        </span>
                      </div>
                      <p className="text-body-sm text-primary-500 mb-3">{principle.description}</p>
                      <div>
                        <p className="overline mb-2">
                          Key Indicators
                        </p>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                          {principle.indicators.map((indicator: string, i: number) => (
                            <li key={i} className="flex items-start gap-1.5 text-body-sm text-primary-500">
                              <span style={{ color: 'var(--brass)', marginTop: '0.2rem', flexShrink: 0 }} aria-hidden="true">▸</span>
                              {indicator}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card mt-6 p-6">
            <p className="overline mb-2">
              Evidence Weighting
            </p>
            <p className="text-body-sm text-primary-600 leading-relaxed">
              Bill sponsorships carry the highest weight, followed by floor and committee votes,
              co-sponsorships, and questionnaire responses. Sponsorships tied to Chamber priority bills
              receive an additional 3× multiplier. Public statements, press releases, and social media
              carry lower weight but provide crucial context for challengers without a voting record.
            </p>
          </div>
        </section>

        {/* Campaign finance */}
        <section className="card p-8">
          <p className="overline">Data Sources</p>
          <h2 className="text-heading-3 mt-3 mb-3">Campaign Finance Data</h2>
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
            <Link href="/funding-intelligence" className="text-body-sm font-medium hover:underline" style={{ color: 'var(--brass)' }}>
              View full donor classification database →
            </Link>
          </div>
        </section>

        {/* Disclaimer */}
        <section className="rounded-lg p-6" style={{ background: 'var(--brass-wash)', border: '1px solid var(--rule)' }}>
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
      <section className="py-12 lg:py-16" style={{ background: 'var(--card)', borderTop: '1px solid var(--rule)' }}>
        <div className="container-page">
          <div className="text-center mb-10">
            <p className="overline">The Team</p>
            <h2 className="text-heading-2 mt-3 mb-3">Built By</h2>
            <p className="text-body-sm text-primary-500 max-w-xl mx-auto">
              This tool was designed and built by the SCAI team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {TEAM_MEMBERS.map((member) => (
              <div key={member.name} className="card card-hover p-8 text-center">
                <div className="mb-5">
                  <div className="w-28 h-28 mx-auto rounded-full overflow-hidden relative" style={{ border: '2px solid var(--rule-strong)' }}>
                    <Image src={member.photo} alt={member.name} fill className="object-cover" />
                  </div>
                </div>
                <h3 className="text-heading-4 text-primary-950 mb-1">{member.name}</h3>
                <p className="text-body-sm text-primary-500 font-medium mb-4">{member.role}</p>
                <a
                  href={member.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-caption"
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
