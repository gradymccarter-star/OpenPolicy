'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn-secondary text-caption"
    >
      Print / Save PDF
    </button>
  );
}
