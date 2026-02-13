import Image from 'next/image';

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
  return (
    <main>
      <div className="container-page py-12">
        <h1 className="text-heading-1 mb-8">
          About OpenPolicy AI
        </h1>

        <div className="space-y-6">
          <section className="card p-8">
            <h2 className="text-heading-4 mb-3">Mission</h2>
            <p className="text-body-sm text-primary-500 leading-relaxed">
              OpenPolicy AI provides transparent, data-driven evaluation of US politicians&apos;
              alignment with internationally recognized AI principles established by the OECD.
              Our goal is to make AI policy understanding clear, accessible, and transparent.
            </p>
          </section>

          <section className="card p-8">
            <h2 className="text-heading-4 mb-3">Methodology</h2>
            <p className="text-body-sm text-primary-500 leading-relaxed mb-4">
              We analyze politicians&apos; voting records, bill sponsorships, and public statements
              using a multi-signal evidence framework to evaluate alignment with 5 core OECD AI principles:
            </p>
            <ol className="list-decimal ml-6 space-y-2 text-body-sm text-primary-500">
              <li>Inclusive Growth, Sustainable Development &amp; Well-being</li>
              <li>Human-Centered Values &amp; Fairness</li>
              <li>Transparency &amp; Explainability</li>
              <li>Robustness, Security &amp; Safety</li>
              <li>Accountability</li>
            </ol>
          </section>

          <section className="card p-8">
            <h2 className="text-heading-4 mb-3">How It Works</h2>
            <div className="space-y-3 text-body-sm text-primary-500 leading-relaxed">
              <p>
                <span className="font-semibold text-primary-950">1. Evidence Collection</span> &mdash;
                We collect floor votes, bill sponsorships, committee statements, and press releases from public sources.
              </p>
              <p>
                <span className="font-semibold text-primary-950">2. AI Classification</span> &mdash;
                Claude AI classifies each evidence item for AI relevance, bill direction, and extracts structured claims.
              </p>
              <p>
                <span className="font-semibold text-primary-950">3. Deterministic Scoring</span> &mdash;
                All scores are calculated using transparent, deterministic math. The AI never produces scores directly.
              </p>
            </div>
          </section>

          <section className="card p-8">
            <h2 className="text-heading-4 mb-3">Transparency</h2>
            <p className="text-body-sm text-primary-500 leading-relaxed">
              All scores are accompanied by confidence levels. Every score is traceable to specific
              evidence items, including source text and extracted claims. We display our full methodology
              to ensure accountability.
            </p>
          </section>

          <section className="card p-8">
            <h2 className="text-heading-4 mb-3">Disclaimer</h2>
            <p className="text-body-sm text-primary-500 leading-relaxed font-medium">
              This platform is for informational purposes only. Scores are based on computational
              analysis of public data and should not be taken as definitive assessments.
              Always verify with primary sources.
            </p>
          </section>
        </div>
      </div>

      {/* Team Section */}
      <section className="py-12 lg:py-16" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <div className="text-center mb-10">
            <h2 className="text-heading-2 mb-3">
              Meet The Team
            </h2>
            <p className="text-body-sm text-primary-500 max-w-xl mx-auto">
              OpenPolicy AI is built by a team committed to bringing transparency
              to AI policy and governance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {TEAM_MEMBERS.map((member, index) => (
              <div
                key={index}
                className="card card-hover p-8 text-center"
              >
                <div className="mb-5">
                  <div className="w-28 h-28 mx-auto rounded-full overflow-hidden relative" style={{ border: '2px solid var(--border)' }}>
                    <Image
                      src={member.photo}
                      alt={member.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <h3 className="text-heading-4 text-primary-950 mb-1">
                    {member.name}
                  </h3>
                  <p className="text-body-sm text-primary-500 font-medium">
                    {member.role}
                  </p>
                </div>

                {member.linkedin ? (
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
                ) : (
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-caption font-medium text-primary-400" style={{ background: 'var(--surface-base)' }}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    LinkedIn
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
