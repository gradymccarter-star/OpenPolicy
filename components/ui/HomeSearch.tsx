'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function HomeSearch() {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/politicians?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push('/politicians');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
      <svg
        className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 pointer-events-none"
        style={{ color: 'var(--ink-tertiary)' }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, district, or party..."
        className="w-full pl-14 pr-36 py-4 rounded-md text-base font-medium placeholder:text-primary-400 outline-none"
        style={{
          background: 'var(--well)',
          border: '1px solid var(--rule)',
          color: 'var(--ink)',
          transition: 'border-color 0.15s ease',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'var(--ink)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'var(--rule)'; }}
      />
      <button
        type="submit"
        className="btn-primary absolute right-2 top-1/2 -translate-y-1/2 text-sm"
      >
        Search
      </button>
    </form>
  );
}
