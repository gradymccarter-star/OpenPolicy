import { OECD_PRINCIPLES } from '@/lib/utils/constants';
import ScoringPipeline from '@/components/methodology/ScoringPipeline';

export default function PrinciplesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="py-14 lg:py-20" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <h1 className="text-heading-1 mb-4">
            Our Scoring Formula
          </h1>
          <p className="text-body text-primary-500 max-w-2xl leading-relaxed">
            Every score starts with real evidence: votes, sponsorships,{' '}
            <span className="inline-block">committee actions and public statements.</span>{' '}
            Here&apos;s how it works.
          </p>
        </div>
      </section>

      {/* Intro + Pipeline */}
      <section className="container-page py-10 lg:py-14">
        <div className="rounded-xl p-6 mb-10" style={{ background: 'var(--surface-canvas)', borderLeft: '4px solid var(--foreground)' }}>
          <p className="text-body text-primary-500 leading-relaxed">
            <span className="inline-block">OpenPolicy AI evaluates every U.S. senator&apos;s alignment with the five OECD AI Principles:</span>{' '}
            <span className="inline-block"><strong className="text-primary-950">inclusive growth, human-centered values, transparency, robustness and safety, and accountability</strong>.</span>{' '}
            Every score traces back to a specific vote or quote with a source link.
          </p>
        </div>

        <ScoringPipeline />
      </section>

      {/* OECD Principles */}
      <section className="py-10 lg:py-14" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <h2 className="text-heading-2 mb-2">
            OECD AI Principles
          </h2>
          <p className="text-body-sm text-primary-500 mb-8">
            The international framework for responsible AI governance — what we measure
          </p>

          <div className="space-y-6">
            {Object.entries(OECD_PRINCIPLES).map(([key, principle], index) => (
              <div key={key} className="card p-8">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-primary-950 text-white rounded-full flex items-center justify-center text-lg font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-heading-4 mb-2">
                      {principle.name}
                    </h3>
                    <p className="text-body-sm text-primary-500 mb-4">
                      {principle.description}
                    </p>
                    <div>
                      <p className="text-body-sm font-semibold text-primary-950 mb-2">Key Indicators:</p>
                      <ul className="text-body-sm text-primary-500 space-y-1 ml-4">
                        {principle.indicators.map((indicator, i) => (
                          <li key={i} className="list-disc">{indicator}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
