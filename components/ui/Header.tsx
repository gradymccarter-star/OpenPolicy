'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Keystone from './Keystone';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/politicians', label: 'Candidates' },
  { href: '/compare', label: 'Compare' },
  { href: '/funding-intelligence', label: 'Funding Intel' },
  { href: '/about', label: 'About' },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center gap-2">
              <Keystone size={20} style={{ color: '#c9a84c' }} />
              <span className="text-body-sm font-bold tracking-tight" style={{ color: '#0a1628' }}>PA Chamber</span>
              <span className="text-body-sm font-bold tracking-tight" style={{ color: '#c9a84c' }}>· 2026</span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-body-sm transition-colors ${
                  pathname === link.href
                    ? 'text-primary-950 font-semibold'
                    : 'text-primary-500 hover:text-primary-950 font-medium'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            className="md:hidden p-2 -mr-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileOpen ? (
                <path d="M6 6l12 12M6 18L18 6" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {mobileOpen && (
          <nav className="md:hidden pb-4 space-y-1">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className={`block py-2 text-body-sm ${
                  pathname === link.href
                    ? 'text-primary-950 font-semibold'
                    : 'text-primary-500 font-medium'
                }`}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
