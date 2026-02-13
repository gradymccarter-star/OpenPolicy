'use client';

import { useState } from 'react';

const pipelineSteps = [
  {
    id: 'collection',
    num: 1,
    title: 'Evidence Collection',
    description: 'We collect public political data: floor votes, bill sponsorships, committee remarks, speeches, press releases, and social media posts.',
    details: 'A two-stage filter removes irrelevant content and tags everything with the OECD principles it applies to.',
  },
  {
    id: 'weighting',
    num: 2,
    title: 'Evidence Weighting',
    description: 'A binding floor vote matters more than a tweet. Every type of evidence gets a fixed weight.',
    weights: [
      { type: 'Floor Votes', weight: 1.0 },
      { type: 'Bill Sponsorships', weight: 0.9 },
      { type: 'Bill Co-sponsorships', weight: 0.7 },
      { type: 'Committee Remarks', weight: 0.6 },
      { type: 'Floor Speeches', weight: 0.5 },
      { type: 'Press Releases', weight: 0.4 },
      { type: 'Social Media Posts', weight: 0.2 },
    ],
  },
  {
    id: 'scoring',
    num: 3,
    title: 'Two Scoring Tracks',
    description: 'Votes are scored deterministically. Statements are analyzed for claims.',
    tracks: [
      {
        name: 'Votes',
        process: "We classify each bill's direction once \u2014 does a Yea support or oppose the principle? Then, score = position \u00d7 direction.",
      },
      {
        name: 'Statements',
        process: "The LLM extracts structured claims \u2014 stance, strength, and hedging \u2014 but never produces a score. Those claims map to numbers through a fixed lookup table. Strong support with no hedging scores 1.0. Strong support with hedging drops to 0.85.",
      },
    ],
  },
  {
    id: 'formula',
    num: 4,
    title: 'The Formula',
    description: "Each senator's score on each OECD principle is calculated as a weighted average.",
    formula: {
      display: 'P = \u03a3(s \u00d7 w \u00d7 d \u00d7 c) / \u03a3(w \u00d7 d \u00d7 c)',
      variables: [
        { symbol: 's', meaning: "Evidence item's score" },
        { symbol: 'w', meaning: 'Evidence type weight' },
        { symbol: 'd', meaning: 'Temporal decay (biasing recency)' },
        { symbol: 'c', meaning: 'Confidence' },
      ],
      explanation: 'This is a weighted average. The result always stays between 0 and 1. Five principle scores average into one overall alignment score.',
    },
  },
  {
    id: 'confidence',
    num: 5,
    title: 'Confidence Levels',
    description: 'Not all scores are equally certain. We calculate confidence based on evidence diversity and volume.',
    formula: {
      display: 'C = \u03b1(1 \u2212 e^(\u22120.1n)) + \u03b2(t / T) + \u03b3(\u03a3c\u1d62 / n)',
      variables: [
        { symbol: 'n', meaning: 'Number of evidence items' },
        { symbol: 't', meaning: 'Distinct source types present' },
        { symbol: 'T', meaning: 'Total possible source types' },
        { symbol: '\u03b1=0.4, \u03b2=0.3, \u03b3=0.3', meaning: 'Fixed component weights' },
      ],
      explanation: "This weights the total number of evidence items (e.g. 3 votes + 2 speeches + 15 tweets), the number of distinct source types used (votes + speeches + tweets = 3 types), and the existing confidence of each evidence item.",
    },
  },
  {
    id: 'output',
    num: 6,
    title: 'Final Product',
    description: "Every senator gets a comprehensive profile showing exactly how their score was calculated.",
    outputs: [
      'Five OECD principle scores (0\u2013100%)',
      'One overall alignment score',
      'Confidence level for the score',
      'Full evidence trail with source links',
    ],
  },
];

export default function ScoringPipeline() {
  const [activeStep, setActiveStep] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {/* Pipeline Steps */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {pipelineSteps.map((step) => (
          <button
            key={step.id}
            onClick={() => setActiveStep(activeStep === step.id ? null : step.id)}
            className={`flex flex-col items-center p-4 rounded-xl transition-all duration-200 cursor-pointer border ${
              activeStep === step.id
                ? 'bg-primary-950 text-white border-primary-950'
                : 'bg-white text-primary-950 border-primary-200 hover:border-primary-400'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-body-sm mb-2 ${
              activeStep === step.id
                ? 'bg-white text-primary-950'
                : 'bg-primary-100 text-primary-950'
            }`}>
              {step.num}
            </div>
            <span className="text-caption font-medium text-center leading-tight">
              {step.title}
            </span>
          </button>
        ))}
      </div>

      {/* Expanded Detail */}
      {activeStep ? (
        <div className="card p-8 animate-fade-in">
          {pipelineSteps.map((step) => {
            if (step.id !== activeStep) return null;

            return (
              <div key={step.id}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-primary-950 text-white rounded-full flex items-center justify-center font-bold text-body-sm">
                    {step.num}
                  </div>
                  <h3 className="text-heading-3 text-primary-950">{step.title}</h3>
                </div>

                <p className="text-body text-primary-500 mb-6 leading-relaxed">
                  {step.description}
                </p>

                {/* Evidence Weights */}
                {step.weights && (
                  <div className="rounded-xl p-6 mb-6" style={{ background: 'var(--surface-canvas)' }}>
                    <h4 className="font-semibold text-primary-950 mb-4 text-body-sm">Evidence Type Weights</h4>
                    <div className="space-y-3">
                      {step.weights.map((item) => (
                        <div key={item.type} className="flex items-center justify-between gap-4">
                          <span className="text-body-sm text-primary-500 min-w-[140px]">{item.type}</span>
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                              <div
                                className="h-full bg-primary-950 rounded-full transition-all duration-500"
                                style={{ width: `${item.weight * 100}%` }}
                              />
                            </div>
                            <span className="font-mono font-bold text-body-sm text-primary-950 w-8 text-right">
                              {item.weight.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Scoring Tracks */}
                {step.tracks && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    {step.tracks.map((track) => (
                      <div key={track.name} className="rounded-xl p-6" style={{ background: 'var(--surface-canvas)' }}>
                        <h4 className="font-semibold text-primary-950 mb-2 text-body-sm">{track.name}</h4>
                        <p className="text-caption text-primary-500 leading-relaxed">{track.process}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formula */}
                {step.formula && (
                  <div className="bg-primary-950 text-white rounded-xl p-6 mb-6">
                    <div className="font-mono text-lg text-center mb-6 bg-primary-900 py-4 rounded-lg">
                      {step.formula.display}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                      {step.formula.variables.map((v) => (
                        <div key={v.symbol} className="flex items-start gap-2">
                          <span className="font-mono font-bold text-primary-300 flex-shrink-0">
                            {v.symbol} =
                          </span>
                          <span className="text-caption text-primary-200">{v.meaning}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-caption text-primary-300 italic border-t border-primary-700 pt-4">
                      {step.formula.explanation}
                    </p>
                  </div>
                )}

                {/* Additional Details */}
                {step.details && (
                  <p className="text-body-sm text-primary-400 italic">{step.details}</p>
                )}

                {/* Final Outputs */}
                {step.outputs && (
                  <div className="rounded-xl p-6" style={{ background: 'var(--surface-canvas)' }}>
                    <h4 className="font-semibold text-primary-950 mb-3 text-body-sm">What each senator receives:</h4>
                    <ul className="space-y-2">
                      {step.outputs.map((output, i) => (
                        <li key={i} className="flex items-start gap-2 text-body-sm text-primary-500">
                          <svg className="w-5 h-5 text-primary-950 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          {output}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-primary-400 text-body-sm">
            Click any step above to learn how we calculate scores
          </p>
        </div>
      )}
    </div>
  );
}
