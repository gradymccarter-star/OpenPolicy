import { PA_CHAMBER_PRINCIPLES } from '@/lib/utils/constants';
import ScoringPipeline from '@/components/methodology/ScoringPipeline';
import HeroBackground from '@/components/ui/HeroBackground';

const PRINCIPLE_COLORS = [
  '#c9a84c', // gold
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

export default function PrinciplesPage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative py-16 lg:py-24 overflow-hidden" style={{ background: '#07111f' }}>
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'url(/pa-flag.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.10,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(7,17,31,0.6) 0%, rgba(7,17,31,0.85) 70%, rgba(7,17,31,1) 100%)',
          }}
        />
        <HeroBackground />
        <div className="container-page relative z-10">
          <p className="text-caption font-semibold uppercase tracking-widest mb-3" style={{ color: '#c9a84c' }}>
            PA Chamber · Scoring Framework
          </p>
          <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
            How We Score<br />
            <span style={{ color: '#c9a84c' }}>9 Business Priorities</span>
          </h1>
          <p className="text-body text-white/50 max-w-2xl leading-relaxed">
            Every score starts with real evidence: votes, bill sponsorships,{' '}
            committee actions, public statements, and questionnaire responses.{' '}
            Here&apos;s how it works.
          </p>
        </div>
      </section>

      {/* Intro + Pipeline */}
      <section className="container-page py-10 lg:py-14">
        <div
          className="rounded-xl p-6 mb-10"
          style={{ background: 'rgba(201,168,76,0.06)', borderLeft: '4px solid #c9a84c', border: '1px solid rgba(201,168,76,0.2)', borderLeftWidth: '4px' }}
        >
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
      <section className="py-10 lg:py-14" style={{ background: '#f8f7f5' }}>
        <div className="container-page">
          <p className="text-caption font-semibold uppercase tracking-widest mb-2" style={{ color: '#c9a84c' }}>
            The 9 Dimensions
          </p>
          <h2 className="text-heading-2 mb-2">PA Chamber Business Priorities</h2>
          <p className="text-body-sm text-primary-500 mb-8">
            Derived from the PA Chamber&apos;s 2025 Legislative Agenda — the nine dimensions we score each candidate on
          </p>

          <div className="space-y-4">
            {Object.entries(PA_CHAMBER_PRINCIPLES).map(([key, principle], index) => {
              const color = PRINCIPLE_COLORS[index % PRINCIPLE_COLORS.length];
              return (
                <div
                  key={key}
                  className="rounded-2xl p-6 bg-white"
                  style={{ border: '1px solid #e5e7eb', borderLeft: `4px solid ${color}` }}
                >
                  <div className="flex items-start gap-5">
                    <div
                      className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold"
                      style={{ background: color, color: index === 0 ? '#0a1628' : '#fff' }}
                    >
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1.5">
                        <h3 className="text-heading-4">{principle.name}</h3>
                        <span
                          className="text-caption font-bold px-2 py-0.5 rounded-full"
                          style={{ background: `${color}18`, color }}
                        >
                          {key}
                        </span>
                      </div>
                      <p className="text-body-sm text-primary-500 mb-3">{principle.description}</p>
                      <div>
                        <p className="text-caption font-semibold uppercase tracking-widest mb-2" style={{ color }}>
                          Key Indicators
                        </p>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                          {principle.indicators.map((indicator, i) => (
                            <li key={i} className="flex items-start gap-1.5 text-body-sm text-primary-500">
                              <span style={{ color, marginTop: '0.2rem', flexShrink: 0 }}>▸</span>
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

          <div
            className="mt-8 rounded-xl p-6"
            style={{ background: '#0a1628', color: 'rgba(255,255,255,0.7)' }}
          >
            <p className="text-caption font-semibold uppercase tracking-widest mb-2" style={{ color: '#c9a84c' }}>
              Evidence Weighting
            </p>
            <p className="text-body-sm leading-relaxed">
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
