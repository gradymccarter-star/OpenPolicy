'use client';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="btn-secondary text-caption py-2 px-4"
    >
      Print / Save PDF
    </button>
  );
}
