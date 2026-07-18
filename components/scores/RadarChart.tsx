'use client';

import { getScoreColor } from '@/lib/utils/helpers';

interface RadarChartProps {
  scores: { label: string; value: number }[];
  size?: number;
  color?: string;
  label?: string;
  showValues?: boolean;
}

export default function RadarChart({
  scores,
  size = 240,
  color,
  label,
  showValues = true,
}: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.38;
  const levels = 5;
  const n = scores.length;
  const angleStep = (2 * Math.PI) / n;

  const chartColor = color || 'var(--ink)';

  function polarToCart(angle: number, r: number) {
    return {
      x: cx + r * Math.cos(angle - Math.PI / 2),
      y: cy + r * Math.sin(angle - Math.PI / 2),
    };
  }

  // Grid rings
  const rings = Array.from({ length: levels }, (_, i) => {
    const r = (radius / levels) * (i + 1);
    const points = Array.from({ length: n }, (_, j) => {
      const p = polarToCart(j * angleStep, r);
      return `${p.x},${p.y}`;
    }).join(' ');
    return points;
  });

  // Axis lines
  const axes = Array.from({ length: n }, (_, i) => {
    const p = polarToCart(i * angleStep, radius);
    return { x1: cx, y1: cy, x2: p.x, y2: p.y };
  });

  // Data polygon
  const dataPoints = scores.map((s, i) => {
    const r = s.value * radius;
    return polarToCart(i * angleStep, r);
  });
  const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

  // Label positions
  const labels = scores.map((s, i) => {
    const p = polarToCart(i * angleStep, radius + 24);
    return { ...p, label: s.label, value: s.value };
  });

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Grid rings */}
        {rings.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="none"
            stroke="var(--rule)"
            strokeWidth={i === levels - 1 ? 1.5 : 0.5}
          />
        ))}

        {/* Axes */}
        {axes.map((a, i) => (
          <line
            key={i}
            x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke="var(--rule)"
            strokeWidth={0.5}
          />
        ))}

        {/* Data fill */}
        <polygon
          points={dataPath}
          fill={chartColor}
          fillOpacity={0.08}
          stroke={chartColor}
          strokeWidth={2}
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={3}
            fill={chartColor}
          />
        ))}

        {/* Labels */}
        {labels.map((l, i) => (
          <text
            key={i}
            x={l.x} y={l.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="figure text-xs font-medium"
            fill="var(--ink-tertiary)"
          >
            {l.label}
          </text>
        ))}

        {/* Values */}
        {showValues && labels.map((l, i) => (
          <text
            key={`v-${i}`}
            x={l.x}
            y={l.y + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            className="figure text-xs font-bold"
            fill={chartColor}
          >
            {Math.round(l.value * 100)}%
          </text>
        ))}
      </svg>
      {label && (
        <p className="text-body-sm font-semibold text-primary-950 mt-1">{label}</p>
      )}
    </div>
  );
}

// Overlay version for comparison
interface ComparisonRadarProps {
  datasets: {
    scores: { label: string; value: number }[];
    color: string;
    name: string;
  }[];
  size?: number;
}

export function ComparisonRadar({ datasets, size = 300 }: ComparisonRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.35;
  const levels = 5;
  const n = datasets[0]?.scores.length || 5;
  const angleStep = (2 * Math.PI) / n;

  function polarToCart(angle: number, r: number) {
    return {
      x: cx + r * Math.cos(angle - Math.PI / 2),
      y: cy + r * Math.sin(angle - Math.PI / 2),
    };
  }

  const rings = Array.from({ length: levels }, (_, i) => {
    const r = (radius / levels) * (i + 1);
    const points = Array.from({ length: n }, (_, j) => {
      const p = polarToCart(j * angleStep, r);
      return `${p.x},${p.y}`;
    }).join(' ');
    return points;
  });

  const axes = Array.from({ length: n }, (_, i) => {
    const p = polarToCart(i * angleStep, radius);
    return { x1: cx, y1: cy, x2: p.x, y2: p.y };
  });

  const principleLabels = datasets[0]?.scores.map((s, i) => {
    const p = polarToCart(i * angleStep, radius + 28);
    return { ...p, label: s.label };
  }) || [];

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {rings.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="none"
            stroke="var(--rule)"
            strokeWidth={i === levels - 1 ? 1.5 : 0.5}
          />
        ))}

        {axes.map((a, i) => (
          <line
            key={i}
            x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke="var(--rule)"
            strokeWidth={0.5}
          />
        ))}

        {datasets.map((ds, di) => {
          const dataPoints = ds.scores.map((s, i) => {
            const r = s.value * radius;
            return polarToCart(i * angleStep, r);
          });
          const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');
          // First polygon reads as ink, second as brass — per the comparison spec
          const stroke = di === 0 ? 'var(--ink)' : di === 1 ? 'var(--brass-bright)' : ds.color;
          const fill = di === 0 ? 'rgba(19,26,38,0.08)' : di === 1 ? 'rgba(201,168,76,0.12)' : ds.color;

          return (
            <g key={di}>
              <polygon
                points={dataPath}
                fill={fill}
                fillOpacity={di <= 1 ? 1 : 0.1}
                stroke={stroke}
                strokeWidth={2}
              />
              {dataPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={stroke} />
              ))}
            </g>
          );
        })}

        {principleLabels.map((l, i) => (
          <text
            key={i}
            x={l.x} y={l.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="figure text-xs font-medium"
            fill="var(--ink-tertiary)"
          >
            {l.label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center space-x-6 mt-3">
        {datasets.map((ds, i) => (
          <div key={i} className="flex items-center space-x-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: i === 0 ? 'var(--ink)' : i === 1 ? 'var(--brass-bright)' : ds.color }}
            />
            <span className="text-body-sm font-medium text-primary-500">{ds.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
