// Simplified Pennsylvania state outline SVG
// Key features: Erie panhandle NW, rectangular body, slight Delaware River angle east

interface PaOutlineProps {
  className?: string;
  style?: React.CSSProperties;
  strokeWidth?: number;
}

export default function PaOutline({ className, style, strokeWidth = 2 }: PaOutlineProps) {
  return (
    <svg
      viewBox="0 0 200 130"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Pennsylvania outline:
          - Erie panhandle in NW (small rectangular protrusion)
          - Main rectangular body
          - Delaware River on east (slight diagonal)
          - Mason-Dixon line (south, mostly straight) */}
      <path
        d="
          M 8 126
          L 8 28
          L 8 7
          L 40 7
          L 40 28
          L 192 26
          L 196 32
          L 191 128
          Z
        "
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
