// Keystone icon — Pennsylvania is the "Keystone State"
// Architectural keystone shape: trapezoidal with notched shoulder ears

interface KeystoneProps {
  className?: string;
  style?: React.CSSProperties;
  size?: number;
}

export default function Keystone({ className, style, size = 24 }: KeystoneProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 110"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Keystone shape:
          Wide flat top, notched shoulder ears, narrows toward bottom */}
      <path d="
        M 18 0
        L 82 0
        L 100 22
        L 100 36
        L 82 36
        L 66 110
        L 34 110
        L 18 36
        L 0 36
        L 0 22
        Z
      " />
    </svg>
  );
}
