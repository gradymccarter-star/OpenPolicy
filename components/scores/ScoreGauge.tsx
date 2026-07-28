'use client';

import { getScoreColor, getConfidenceColor, rescaleScore } from '@/lib/utils/helpers';

interface ScoreGaugeProps {
  score: number;
  confidence?: number;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  label?: string;
  hasRecord?: boolean;
}

export default function ScoreGauge({
  score,
  confidence,
  size = 'medium',
  showLabel = true,
  label,
  hasRecord = true,
}: ScoreGaugeProps) {
  const scaled = rescaleScore(score);
  const percentage = scaled * 100;
  const color = hasRecord ? getScoreColor(scaled) : '#878d9b'; // ink-tertiary; SVG attrs can't take CSS vars

  const sizes = {
    small: { width: 80, height: 80, stroke: 4, fontSize: 'text-lg', confSize: 'text-caption' },
    medium: { width: 120, height: 120, stroke: 5, fontSize: 'text-2xl', confSize: 'text-caption' },
    large: { width: 160, height: 160, stroke: 6, fontSize: 'text-3xl', confSize: 'text-body-sm' },
  };

  const { width, height, stroke, fontSize, confSize } = sizes[size];
  const radius = (width - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const confColor = confidence !== undefined ? getConfidenceColor(confidence) : undefined;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width, height }}>
        <svg width={width} height={height} className="transform -rotate-90">
          <circle
            cx={width / 2}
            cy={height / 2}
            r={radius}
            fill="none"
            stroke="var(--well)"
            strokeWidth={stroke}
          />
          <circle
            cx={width / 2}
            cy={height / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="butt"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {hasRecord ? (
            <>
              <span className={`figure font-semibold ${fontSize}`} style={{ color }}>
                {Math.round(scaled * 100)}%
              </span>
              {confidence !== undefined && (
                <span className={`${confSize} font-medium`} style={{ color: confColor }}>
                  {Math.round(confidence * 100)}% conf
                </span>
              )}
            </>
          ) : (
            <span className={`font-medium text-primary-400 ${confSize}`}>No record</span>
          )}
        </div>
      </div>
      {showLabel && label && (
        <p className="mt-2 text-caption font-medium uppercase text-primary-400 text-center" style={{ letterSpacing: '0.08em' }}>
          {label}
        </p>
      )}
    </div>
  );
}
