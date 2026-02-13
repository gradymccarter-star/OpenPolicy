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

  const chartColor = color || '#0a0e1a';

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
            stroke="rgba(0,0,0,0.08)"
            strokeWidth={i === levels - 1 ? 1.5 : 0.5}
          />
        ))}

        {/* Axes */}
        {axes.map((a, i) => (
          <line
            key={i}
            x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke="rgba(0,0,0,0.08)"
            strokeWidth={0.5}
          />
        ))}

        {/* Data fill */}
        <polygon
          points={dataPath}
          fill={chartColor}
          fillOpacity={0.12}
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
            className="text-xs font-medium"
            fill="#9ca3af"
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
            className="text-xs font-bold"
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
            stroke="rgba(0,0,0,0.08)"
            strokeWidth={i === levels - 1 ? 1.5 : 0.5}
          />
        ))}

        {axes.map((a, i) => (
          <line
            key={i}
            x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2}
            stroke="rgba(0,0,0,0.08)"
            strokeWidth={0.5}
          />
        ))}

        {datasets.map((ds, di) => {
          const dataPoints = ds.scores.map((s, i) => {
            const r = s.value * radius;
            return polarToCart(i * angleStep, r);
          });
          const dataPath = dataPoints.map((p) => `${p.x},${p.y}`).join(' ');

          return (
            <g key={di}>
              <polygon
                points={dataPath}
                fill={ds.color}
                fillOpacity={0.1}
                stroke={ds.color}
                strokeWidth={2}
              />
              {dataPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill={ds.color} />
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
            className="text-xs font-medium"
            fill="#9ca3af"
          >
            {l.label}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center space-x-6 mt-3">
        {datasets.map((ds, i) => (
          <div key={i} className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ds.color }} />
            <span className="text-body-sm font-medium text-primary-500">{ds.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
