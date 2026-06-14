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
        style={{ color: 'rgba(255,255,255,0.35)' }}
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
        className="w-full pl-14 pr-36 py-5 rounded-2xl text-base font-medium text-white placeholder-white/30 outline-none"
        style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 0 0 0 transparent',
        }}
        onFocus={(e) => { e.target.style.border = '1px solid rgba(201,168,76,0.5)'; }}
        onBlur={(e) => { e.target.style.border = '1px solid rgba(255,255,255,0.15)'; }}
      />
      <button
        type="submit"
        className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2.5 rounded-xl font-bold text-sm transition-opacity hover:opacity-90"
        style={{ background: '#c9a84c', color: '#0a1628' }}
      >
        Search
      </button>
    </form>
  );
}
