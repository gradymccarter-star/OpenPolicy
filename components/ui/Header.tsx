'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Keystone from './Keystone';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/politicians', label: 'Candidates' },
  { href: '/overview', label: 'Map' },
  { href: '/compare', label: 'Compare' },
  { href: '/funding-intelligence', label: 'Funding' },
  { href: '/endorsements', label: 'Endorsements' },
  { href: '/agent', label: 'AI Agent' },
  { href: '/about', label: 'About' },
];

export default function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-sm"
      style={{
        background: 'rgba(247, 245, 240, 0.92)',
        borderBottom: '1px solid var(--rule)',
        boxShadow: 'inset 0 2px 0 var(--brass-bright)',
      }}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0">
            <Link href="/" className="flex items-center gap-2.5">
              <Keystone size={18} style={{ color: 'var(--brass-bright)' }} />
              <span className="font-serif text-base font-semibold tracking-tight text-primary-950">
                PA Chamber <span className="italic font-normal" style={{ color: 'var(--brass)' }}>Intelligence</span>
              </span>
            </Link>
          </div>

          <nav className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map(link => (
              <Link
                key={link.href}
                href={link.href}
                className="relative text-body-sm py-1 transition-colors"
                style={
                  pathname === link.href
                    ? { color: 'var(--ink)', fontWeight: 600, boxShadow: 'inset 0 -2px 0 var(--brass-bright)' }
                    : { color: 'var(--ink-secondary)', fontWeight: 500 }
                }
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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              {mobileOpen ? (
                <path d="M6 6l12 12M6 18L18 6" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
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
                    : 'text-primary-600 font-medium'
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
