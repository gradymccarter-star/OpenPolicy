'use client';

import { useMemo } from 'react';
import { geoMercator, geoPath } from 'd3-geo';

export interface DistrictFeature {
  type: 'Feature';
  properties: { district: string; name: string };
  geometry: GeoJSON.Geometry;
}

export interface DistrictGeoJSON {
  type: 'FeatureCollection';
  features: DistrictFeature[];
}

interface Props {
  readonly geojson: DistrictGeoJSON;
  readonly getFill: (district: string) => string;
  readonly selectedDistrict: string | null;
  readonly hoveredDistrict: string | null;
  readonly onSelect: (district: string) => void;
  readonly onHover: (district: string | null) => void;
}

const WIDTH = 760;
const HEIGHT = 560;

export default function PADistrictMap({
  geojson,
  getFill,
  selectedDistrict,
  hoveredDistrict,
  onSelect,
  onHover,
}: Props) {
  const pathFor = useMemo(() => {
    const projection = geoMercator().fitSize([WIDTH, HEIGHT], geojson as any);
    const generator = geoPath().projection(projection);
    return (feature: DistrictFeature) => generator(feature as any) ?? '';
  }, [geojson]);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto"
      role="img"
      aria-label="Map of Pennsylvania House districts"
    >
      {geojson.features.map((feature) => {
        const code = feature.properties.district;
        const isSelected = code === selectedDistrict;
        const isHovered = code === hoveredDistrict;
        return (
          <path
            key={code}
            d={pathFor(feature)}
            fill={getFill(code)}
            stroke={isSelected ? '#0a1628' : '#ffffff'}
            strokeWidth={isSelected ? 2 : 0.75}
            opacity={isHovered && !isSelected ? 0.85 : 1}
            style={{ cursor: 'pointer', transition: 'opacity 0.15s' }}
            onClick={() => onSelect(code)}
            onMouseEnter={() => onHover(code)}
            onMouseLeave={() => onHover(null)}
          >
            <title>{feature.properties.name}</title>
          </path>
        );
      })}
    </svg>
  );
}
