import { PA_CHAMBER_PRINCIPLES } from '@/lib/utils/constants';
import ScoringPipeline from '@/components/methodology/ScoringPipeline';

export default function PrinciplesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="py-14 lg:py-20" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <h1 className="text-heading-1 mb-4">
            Scoring Criteria
          </h1>
          <p className="text-body text-primary-500 max-w-2xl leading-relaxed">
            Every score starts with real evidence: votes, bill sponsorships,{' '}
            committee actions, public statements, and questionnaire responses.{' '}
            Here&apos;s how it works.
          </p>
        </div>
      </section>

      {/* Intro + Pipeline */}
      <section className="container-page py-10 lg:py-14">
        <div className="rounded-xl p-6 mb-10" style={{ background: 'var(--surface-canvas)', borderLeft: '4px solid var(--foreground)' }}>
          <p className="text-body text-primary-500 leading-relaxed">
            Each PA House candidate is scored against{' '}
            <strong className="text-primary-950">nine PA Chamber of Commerce business priorities</strong>:{' '}
            taxes, permitting reform, civil justice, fiscal responsibility, workforce &amp; education,
            energy &amp; environment, labor, infrastructure, and health care.{' '}
            Bill sponsorships carry the highest weight. Every claim links back to a traceable source.
          </p>
        </div>

        <ScoringPipeline />
      </section>

      {/* PA Chamber Principles */}
      <section className="py-10 lg:py-14" style={{ background: 'var(--surface-canvas)' }}>
        <div className="container-page">
          <h2 className="text-heading-2 mb-2">
            PA Chamber Business Priorities
          </h2>
          <p className="text-body-sm text-primary-500 mb-8">
            Derived from the PA Chamber&apos;s 2025 Legislative Agenda — the nine dimensions we score each candidate on
          </p>

          <div className="space-y-6">
            {Object.entries(PA_CHAMBER_PRINCIPLES).map(([key, principle], index) => (
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

          <div className="mt-8 rounded-xl p-6" style={{ background: 'var(--surface-canvas)', borderLeft: '4px solid var(--foreground)' }}>
            <p className="text-body-sm text-primary-500 leading-relaxed">
              <strong className="text-primary-950">Evidence weighting:</strong>{' '}
              Bill sponsorships carry the highest weight, followed by floor and committee votes,
              co-sponsorships, and questionnaire responses. Sponsorships tied to Chamber priority bills
              receive an additional 3× multiplier. Public statements, press releases, and social media
              carry lower weight but provide crucial context for challengers without a voting record.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
